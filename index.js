const fs = require("node:fs");

releaseIds = [
  "Z2lkOi8vcmFwdG9yL1JlbGVhc2UvOTk3ODI",
  "Z2lkOi8vcmFwdG9yL1JlbGVhc2UvMTAxOTA3",
  "Z2lkOi8vcmFwdG9yL1JlbGVhc2UvMTAxOTAx",
  "Z2lkOi8vcmFwdG9yL1JlbGVhc2UvMTAxOTEz",
  "Z2lkOi8vcmFwdG9yL1JlbGVhc2UvMTAxODQ4"]
let apiToken = fs.readFileSync(process.env.HOME + "/.zenhub-credentials", "ascii")
releaseIds.forEach(releaseId => {
  fetchRelease(apiToken, releaseId);
});

async function fetchRelease(apiToken, releaseId, issueNextCursor = "")
{
  let query = `{
      workspace(id: "651c31d0da64142b69396ea8") {
        name
        releases(ids: ["` + releaseId + `"]) {
          edges {
            node {
              title
              issues(first: 55, after: "` + issueNextCursor + `")
              {
                pageInfo {
                  endCursor
                  hasPreviousPage
                  hasNextPage
                }
                edges {
                  cursor
                  node {
                    state
                    repository {
                      name
                    }
                    number
                    title
                    pipelineIssue(workspaceId: "651c31d0da64142b69396ea8") {
                      pipeline {
                        name
                      }
                    }
                    estimate {
                      value
                    }
                    labels(first: 10) {
                      edges {
                        node {
                          name
                        }
                      }
                    }
                    htmlUrl
                  }
                }
              }
            }
          }
        }
      }
    }`
  return fetch("https://api.zenhub.com/public/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Authorization": "Bearer " + apiToken
    },
    body: JSON.stringify({ query }),
  }).then(r => {
    console.log("Zenhub GraphQL API Fetch Response: " + r.status);
    return r.json();
  }).then(res => {
    if (res.errors)
    {
      console.error(res.errors);
      return;
    }
    let release = res.data.workspace.releases.edges.map(o => o.node)[0];
    let releaseData = {};
    if (release.issues.pageInfo.hasNextPage) {
      fetchRelease(apiToken, releaseId, release.issues.pageInfo.endCursor)
    }
    releaseData.title = release.title;
    releaseData.issues = release.issues.edges.map(o => o.node);
    releaseData.issues.forEach(issue => {
      issue.repository = issue.repository.name;
      issue.pipeline = issue.pipelineIssue.pipeline.name;
      delete issue.pipelineIssue;
      issue.estimate = issue.estimate == null ? "" : issue.estimate.value;
      issue.labels = issue.labels.edges.map(o => o.node.name);
    });
    convertZenhubReleaseDataToCsv(releaseData, release.issues.pageInfo.hasPreviousPage);
  });
}

function convertZenhubReleaseDataToCsv(releaseData, append = false) {
  let csvData = append ? "" : "State,Repo Name,Issue Number,Issue Title,Pipeline,Story Points,Labels,Issue Link\n";
  releaseData.issues.forEach(issue => {
    csvData += [
      issue.state,
      issue.repository,
      issue.number,
      issue.title,
      issue.pipeline,
      issue.estimate,
      issue.labels,
      issue.htmlUrl]
      .map(e => '"' + e + '"')
      .join(",") + "\n";

  });

  let outputDir = "output/";
  fs.mkdirSync(outputDir, { recursive: true });

  let outputFilename = outputDir + "release_report_" + releaseData.title.toLowerCase().replace(" ", "_").replace("-", "") + ".csv";
  if (append) {
    fs.appendFile(outputFilename, csvData, (err) => {
      if (err)
      {
        console.error("Unable to write " + releaseData.title + " to " + outputFilename);
        console.error(err);
        return;
      }
      else {
        console.log("Appending " + releaseData.title + " to " + outputFilename);
      }
    });
  } else {
    fs.writeFile(outputFilename, csvData, (err) => {
      if (err)
      {
        console.error("Unable to write " + releaseData.title + " to " + outputFilename);
        console.error(err);
        return;
      }
      else {
        console.log("Writing " + releaseData.title + " to " + outputFilename);
      }
    });
  }
}
