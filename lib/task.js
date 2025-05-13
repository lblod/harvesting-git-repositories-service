import {
  sparqlEscapeUri,
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
  query,
  update,
} from "mu";
import {
  TASK_TYPE,
  PREFIXES,
  STATUS_BUSY,
  STATUS_FAILED,
  ERROR_URI_PREFIX,
  TASK_HARVEST_GIT_ORG,
  ERROR_TYPE,
  connectionOptions,
} from "../constants";
import { parseResult } from "./utils";

export async function failBusyImportTasks() {
  const queryStr = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
    DELETE {
        ?task adms:status ${sparqlEscapeUri(STATUS_BUSY)} .
        ?task dct:modified ?modified.
    }
    INSERT {
       ?task adms:status ${sparqlEscapeUri(STATUS_FAILED)} .
       ?task dct:modified ${sparqlEscapeDateTime(new Date())}.
    }
    WHERE {
        ?task a ${sparqlEscapeUri(TASK_TYPE)};
              adms:status ${sparqlEscapeUri(STATUS_BUSY)};
              task:operation ${sparqlEscapeUri(TASK_HARVEST_GIT_ORG)}.
        OPTIONAL { ?task dct:modified ?modified. }
    }
   `;
  try {
    await update(queryStr, connectionOptions);
  } catch (e) {
    console.warn(
      `WARNING: failed to move busy tasks to failed status on startup.`,
      e,
    );
  }
}

export async function isTask(subject) {
  const queryStr = `
   ${PREFIXES}
   SELECT ?subject WHERE {
      BIND(${sparqlEscapeUri(subject)} as ?subject)
      ?subject a ${sparqlEscapeUri(TASK_TYPE)}.
   }
  `;
  const result = await query(queryStr, connectionOptions);
  return result.results.bindings.length;
}

export async function loadTask(subject) {
  const queryTask = `
   ${PREFIXES}
   SELECT DISTINCT ?task ?id ?job ?created ?modified ?status ?index ?operation ?error WHERE {
      BIND(${sparqlEscapeUri(subject)} as ?task)
      ?task a ${sparqlEscapeUri(TASK_TYPE)}.
      ?task dct:isPartOf ?job;
                    mu:uuid ?id;
                    dct:created ?created;
                    dct:modified ?modified;
                    adms:status ?status;
                    task:index ?index;
                    task:inputContainer ?inputContainer;
                    task:operation ${sparqlEscapeUri(TASK_HARVEST_GIT_ORG)}.

      OPTIONAL { ?task task:error ?error. }
   }
  `;

  const task = parseResult(await query(queryTask, connectionOptions))[0];

  return task;
}
export async function getHarvestCollectionForTask(task) {
  const queryStr = `
    PREFIX tasks: <http://redpencil.data.gift/vocabularies/tasks/>
    SELECT ?collection
    WHERE {
        <${task.task}> tasks:inputContainer ?inputContainer.
        ?inputContainer tasks:hasHarvestingCollection ?collection.
    }
    `;
  const collection = parseResult(await query(queryStr, connectionOptions));
  if (!collection?.length) {
    return null;
  }
  return collection[0];
}

export async function getRemoteDataObjects(task, collection) {
  const queryStr = `
    PREFIX    adms: <http://www.w3.org/ns/adms#>
    PREFIX    mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX    nie:  <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX    dct:  <http://purl.org/dc/terms/>
    PREFIX    nfo:  <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX    nuao: <http://www.semanticdesktop.org/ontologies/2010/01/25/nuao#>
    PREFIX    ext:  <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?dataObject ?gitOrgUrl ?uuid 
    WHERE {
        <${collection.collection}> dct:hasPart ?dataObject.
        ?dataObject a nfo:RemoteDataObject;
             mu:uuid ?uuid;
             nie:url ?gitOrgUrl.
    }
`;
  const rdo = parseResult(await query(queryStr, connectionOptions));
  return rdo;
}

export async function updateTaskStatus(task, status) {
  await update(
    `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>
    DELETE {
        ?subject adms:status ?status .
        ?subject dct:modified ?modified.
    }
    INSERT {
       ?subject adms:status ${sparqlEscapeUri(status)}.
       ?subject dct:modified ${sparqlEscapeDateTime(new Date())}.
    }
    WHERE {
        BIND(${sparqlEscapeUri(task.task)} as ?subject)
        ?subject adms:status ?status .
        OPTIONAL { ?subject dct:modified ?modified. }
    }
  `,
    connectionOptions,
  );
}

export async function appendTaskError(task, errorMsg) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
   ${PREFIXES}
   INSERT DATA {
      ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)};
        mu:uuid ${sparqlEscapeString(id)};
        oslc:message ${sparqlEscapeString(errorMsg)}.
      ${sparqlEscapeUri(task.task)} task:error ${sparqlEscapeUri(uri)}.
   }
  `;

  await update(queryError, connectionOptions);
}
