import { tmpdir } from "os";
import YAML from "yaml";
import { DockerfileParser } from "dockerfile-ast";
import { readFile, rm } from "fs/promises";
import {
  connectionOptions,
  GIT_PROVIDER,
  PREFIXES,
  SPARQL_INSERT_BATCH_SIZE,
  STATUS_BUSY,
  STATUS_FAILED,
  STATUS_SUCCESS,
  TARGET_GRAPH,
} from "../constants";
import { simpleGit, SimpleGit, SimpleGitOptions } from "simple-git";
import GithubProvider from "./providers/github";
import {
  appendTaskError,
  getHarvestCollectionForTask,
  getRemoteDataObjects,
  loadTask,
  updateTaskStatus,
} from "./task";
import { Parser, Quad, Writer } from "n3";

import {
  sparqlEscapeUri,
  sparqlEscapeDateTime,
  sparqlEscapeString,
  uuid,
  query,
  update,
} from "mu";

import path from "path";
import { existsSync } from "fs";
const providers = new Map([
  ["http://mu.semte.ch/vcs/github", new GithubProvider()],
]);
const options: Partial<SimpleGitOptions> = {
  baseDir: tmpdir(),
  binary: "git",
  maxConcurrentProcesses: 6,
  trimmed: false,
};
const git: SimpleGit = simpleGit(options);
export async function run(deltaEntry: string) {
  const task = await loadTask(deltaEntry);
  if (!task) return;
  try {
    updateTaskStatus(task, STATUS_BUSY);
    const graphContainer = { id: uuid(), uri: undefined as string | undefined };
    graphContainer.uri = `http://redpencil.data.gift/id/dataContainers/${graphContainer.id}`;
    const fileContainer = { id: uuid(), uri: undefined as string | undefined };
    fileContainer.uri = `http://redpencil.data.gift/id/dataContainers/${fileContainer.id}`;
    const collection = await getHarvestCollectionForTask(task);
    const rdo = await getRemoteDataObjects(task, collection);
    const triples: string[] = [PREFIXES];
    for (const { gitOrgUrl } of rdo) {
      let provider = providers.get(GIT_PROVIDER);
      if (!provider) {
        throw `${GIT_PROVIDER} not handled yet`;
      }
      const repositories = await provider.fetchRepositories(gitOrgUrl);

      for (const repo of repositories) {
        console.log("handling repo", repo);
        const resource = [
          `<${repo.url}> a ext:GitRepository`,
          `<${repo.url}> ext:updatedDate ${sparqlEscapeDateTime(repo.updatedAt || repo.createdAt || new Date())}`,
          `<${repo.url}> ext:name ${sparqlEscapeString(repo.name)}`,
          `<${repo.url}> ext:description ${sparqlEscapeString(repo.description || "")}`,
        ];
        const q = `
                    ${PREFIXES}
                    SELECT DISTINCT ?updatedDate ?uuid WHERE {
                        <${repo.url}> a ext:GitRepository;
                                      mu:uuid ?uuid;
                           ext:updatedDate ?updatedDate.
                    } ORDER BY DESC(?updatedDate) LIMIT 1
                `;
        const res = await query(q, connectionOptions);
        if (res?.results?.bindings?.length) {
          resource.push(
            `<${repo.url}> mu:uuid "${res.results.bindings[0].uuid.value}"`,
          );
          const updatedDate = new Date(
            res.results.bindings[0].updatedDate.value,
          );

          if (repo.updatedAt && repo.updatedAt === updatedDate) {
            console.log("no changes. continue...");
            continue;
          }
        } else {
          resource.push(`<${repo.url}> mu:uuid "${uuid()}"`);
        }
        // clone the repo
        console.log(`cloning ${repo.gitUrl}`);
        const gitPath = path.join(tmpdir(), repo.name);
        await rm(gitPath, { recursive: true, force: true });
        await git.clone(repo.gitUrl.replace("git://", "https://"));
        if (!existsSync(gitPath)) {
          console.error("cannot access", gitPath);
          continue;
        }
        // read dockerfile
        if (existsSync(path.join(gitPath, "Dockerfile"))) {
          let dockerfileContent = await readFile(
            path.join(gitPath, "Dockerfile"),
            {
              encoding: "utf8",
            },
          );
          let dockerfile = DockerfileParser.parse(dockerfileContent);
          const images = dockerfile
            .getFROMs()
            .map((f) => sparqlEscapeString(f.getImage()))
            .join(",");
          resource.push(`<${repo.url}> ext:imageLayers ${images}`);
        }
        // read docker-compose
        if (existsSync(path.join(gitPath, "docker-compose.yml"))) {
          let dockerComposeContent = await readFile(
            path.join(gitPath, "docker-compose.yml"),
            {
              encoding: "utf8",
            },
          );
          let dockerCompose = YAML.parse(dockerComposeContent);
          const services = dockerCompose.services;
          const images = new Set(
            Object.keys(services)
              .map((s) => services[s].image)
              .filter((s) => s?.length)
              .map((f) => sparqlEscapeString(f)),
          );
          resource.push(
            `<${repo.url}> ext:serviceImages ${[...images].join(",")}`,
          );
        }
        triples.push(...resource);
      }

      const parser = new Parser({ format: "text/turtle" });
      const triplesStr = triples.map((t) => `${t}.`).join("\n");
      console.log(`\n${triplesStr}\n`);
      const turtle = parser.parse(triplesStr);
      const rdfTypes = [...turtle].filter(
        (triple) =>
          triple.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
      );
      for (const rdfTypesBatch of chunk(rdfTypes, SPARQL_INSERT_BATCH_SIZE)) {
        const data = await storeToString(rdfTypesBatch);
        await update(`INSERT DATA {${data}}`, connectionOptions);
      }

      const batches = chunk(turtle, SPARQL_INSERT_BATCH_SIZE);
      for (const batch of batches) {
        const ntriples = await storeToString(batch);
        const queryStr = `
            INSERT DATA {
                    ${ntriples}
            }
        `;
        await update(queryStr, connectionOptions);
      }
    }
    await appendTaskResultGraph(task, graphContainer, TARGET_GRAPH);

    updateTaskStatus(task, STATUS_SUCCESS);
  } catch (e) {
    console.error(e);
    if (task) {
      await appendTaskError(task, e.message);
      await updateTaskStatus(task, STATUS_FAILED);
    }
  }
}

function chunk<T>(array: T[], chunkSize: number): T[][] {
  let result: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    let chunk = array.slice(i, i + chunkSize);
    result.push(chunk);
  }
  return result;
}
function storeToString(store: Quad[]) {
  const options = { format: "N-Triples" };
  const writer = new Writer(options);
  store.forEach((q) => writer.addQuad(q.subject, q.predicate, q.object));
  return new Promise((resolve, reject) => {
    writer.end((err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

async function appendTaskResultGraph(
  task: { task: string },
  container: { uri: string | undefined; id: string },
  graphUri: string,
) {
  // prettier-ignore
  const queryStr = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    INSERT DATA {
        ${sparqlEscapeUri(container.uri)} a nfo:DataContainer.
        ${sparqlEscapeUri(container.uri)} mu:uuid ${sparqlEscapeString(container.id)}.
        ${sparqlEscapeUri(container.uri)} task:hasGraph ${sparqlEscapeUri(graphUri)}.

        ${sparqlEscapeUri(task.task)} task:resultsContainer ${sparqlEscapeUri(container.uri)}.
    }
  `;

  await update(queryStr, connectionOptions);
}
