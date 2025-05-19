# harvesting git repositories services

This service aims to extract metadata from a Git organization.
Initially developed to target GitHub, it is designed to be generic enough to support other providers.

This service reacts to deltas and must be used within the context of the LBLOD harvester.

Given a job with the organization URI as input, it will fetch all repositories under that organization,
extract metadata (license, Dockerfile, Docker Compose file, etc.), and insert it as linked data into the triplestore.

Here's an example of scheduled job one can create to trigger the task (notice `<http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url>
<https://api.github.com/orgs/lblod/repos> `):

```turtle
 <http://redpencil.data.gift/id/remote-file/13031600-ddff-4350-a731-24884eb2ecad>
        a       <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#RemoteDataObject>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "13031600-ddff-4350-a731-24884eb2ecad";
        <http://mu.semte.ch/vocabularies/ext/provider>
                <http://mu.semte.ch/vcs/github>;
        <http://purl.org/dc/terms/created>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://purl.org/dc/terms/creator>
                <http://lblod.data.gift/services/job-self-service>;
        <http://purl.org/dc/terms/modified>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://redpencil.data.gift/vocabularies/http/requestHeader>
                <http://data.lblod.info/request-headers/accept/text/html>;
        <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url>
                <https://api.github.com/orgs/lblod/repos> .

<http://redpencil.data.gift/id/harvesting-container/61689753-900a-49fa-ad48-92d2a9b8c321>
        a       <http://lblod.data.gift/vocabularies/harvesting/HarvestingCollection>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "61689753-900a-49fa-ad48-92d2a9b8c321";
        <http://purl.org/dc/terms/creator>
                <http://lblod.data.gift/services/job-self-service>;
        <http://purl.org/dc/terms/hasPart>
                <http://redpencil.data.gift/id/remote-file/13031600-ddff-4350-a731-24884eb2ecad> .

<http://redpencil.data.gift/id/scheduled-task/fbef889a-7b00-4d47-9ebc-3852a0f2a82c>
        a       <http://redpencil.data.gift/vocabularies/tasks/ScheduledTask>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "fbef889a-7b00-4d47-9ebc-3852a0f2a82c";
        <http://purl.org/dc/terms/created>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://purl.org/dc/terms/isPartOf>
                <http://redpencil.data.gift/id/scheduled-job/982610a6-db1b-41d3-880e-2b36121665d8>;
        <http://purl.org/dc/terms/modified>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://redpencil.data.gift/vocabularies/tasks/index>
                0;
        <http://redpencil.data.gift/vocabularies/tasks/inputContainer>
                <http://redpencil.data.gift/id/data-container/99dc876e-21ea-4947-b5de-cc8f5903a1db>;
        <http://redpencil.data.gift/vocabularies/tasks/operation>
                <http://lblod.data.gift/id/jobs/concept/TaskOperation/harvestRepositories> .

<http://redpencil.data.gift/id/data-container/99dc876e-21ea-4947-b5de-cc8f5903a1db>
        a       <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#DataContainer>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "99dc876e-21ea-4947-b5de-cc8f5903a1db";
        <http://redpencil.data.gift/vocabularies/tasks/hasHarvestingCollection>
                <http://redpencil.data.gift/id/harvesting-container/61689753-900a-49fa-ad48-92d2a9b8c321> .

<http://redpencil.data.gift/id/cron-schedule/7a97af5f-902e-4abc-b78a-4efb104910e7>
        a       <http://redpencil.data.gift/vocabularies/tasks/CronSchedule>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "7a97af5f-902e-4abc-b78a-4efb104910e7";
        <http://schema.org/repeatFrequency>
                "45 * * * *" .

<http://redpencil.data.gift/id/scheduled-job/982610a6-db1b-41d3-880e-2b36121665d8>
        a       <http://vocab.deri.ie/cogs#ScheduledJob>;
        <http://mu.semte.ch/vocabularies/core/uuid>
                "982610a6-db1b-41d3-880e-2b36121665d8";
        <http://purl.org/dc/terms/created>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://purl.org/dc/terms/creator>
                <http://lblod.data.gift/services/job-self-service>;
        <http://purl.org/dc/terms/modified>
                "2025-05-13T11:49:44.767Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>;
        <http://purl.org/dc/terms/title>
                "https://api.github.com/orgs/lblod/repos";
        <http://redpencil.data.gift/vocabularies/tasks/operation>
                <http://lblod.data.gift/id/jobs/concept/JobOperation/harvestGitOrg>;
        <http://redpencil.data.gift/vocabularies/tasks/schedule>
                <http://redpencil.data.gift/id/cron-schedule/7a97af5f-902e-4abc-b78a-4efb104910e7> .
```

## Usage

Add the following to your docker-compose file:

```yml
cve-scanner-service:
  image: lblod/harvesting-git-repositories-service
  links:
    - database:database
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

Add the following rule in your delta config:

```json
    {
        match: {
            predicate: {
                type: "uri",
                value: "http://www.w3.org/ns/adms#status",
            },
            object: {
                type: "uri",
                value: "http://redpencil.data.gift/id/concept/JobStatus/scheduled",
            },
        },
        callback: {
            method: "POST",
            url: "http://git-repo-service/delta",
        },
        options: {
            resourceFormat: "v0.0.1",
            gracePeriod: 1000,
            ignoreFromSelf: true,
            foldEffectiveChanges: true
        },
    }
```
