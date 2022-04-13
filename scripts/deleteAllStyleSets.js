const axios = require('axios');
const fs = require("fs-extra");
const path = require("path");
const yargs = require("yargs");

// #region Yargs
const argv = yargs
    .version(false)
    .usage("Deletes all style sets from the server.")
    .group(["baseUrl", "useMdp", "log"], "Files:")
    .option("baseUrl", {
        alias: "url",
        describe: "Set base protocol and domain to be used.",
        default: "https://localhost:443",
        type: "string"
    })
    .option("useMdp", {
        alias: "mdp",
        describe: "Use MDP endpoint URLs instead of LBS. Useful for running script locally.",
        default: false,
        type: "boolean"
    })
    .option("log", {
        describe: "The file path to output the run log to. If not log file is specified will output to stdout.",
        type: "string",
        normalize: true
    })
    .help()
    .wrap(yargs.terminalWidth())
    .argv;
// #endregion

// #region Constants, env, etc
const mdpApiPath = '/TilesetAPI';
const styleSetsPath = '/styles/styleSets';
const mdpQueryParams = {
    'client-id': 'yourClientId',
    'sku': 'G2',
    'creatorResourceName': 'test'
}
const authHeaders = {
    /* 'subscription-key': 'yourSubscriptionKey', */
    'Authorization': 'Bearer yourToken'
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0" // Avoids DEPTH_ZERO_SELF_SIGNED_CERT error for self-signed certs

let filesToDelete = [];
let filesDeleted = 0;
// #endregion

// #region Helper functions
/** Outputs the message to either the console or the log file */
function outputLog(message) {
    if (argv.log) {
        fs.ensureDirSync(path.dirname(argv.log));

        // If this is the first log write start a new file.
        if (!outputLog.hasWritten) {
            fs.writeFileSync(argv.log, message + "\n");
            outputLog.hasWritten = true;
        } else {
            fs.appendFileSync(argv.log, message + "\n");
        }
    } else {
        console.log(message);
    }
}

function callbackFn(response) {
    if (response.status == 204) {
        outputLog("Deleted.");

        if (filesDeleted < filesToDelete.length)
        {
            let deleteUrl = argv.baseUrl;
            let deleteParams = {
                'api-version': '2022-01-01-preview'
            };
            if (argv.useMdp)
            {
                deleteUrl += mdpApiPath;
                deleteParams = {...mdpQueryParams, ...deleteParams};
            }
            deleteUrl += styleSetsPath + '/' + filesToDelete[filesDeleted];
            outputLog(`Deleting ${filesToDelete[filesDeleted]}`);
            filesDeleted++;

            axios.delete(
                deleteUrl,
                {
                    headers: {
                        ...authHeaders
                    },
                    params: deleteParams
                }
            )
            .then(callbackFn)
            .catch(function (error) {
                outputLog(error);
            });
        }
        else
        {
            outputLog("End of our job!");
        }
    }
    else
    {
        outputLog("Error - unexpected status");
        outputLog(response);
    }
}

function getAndDeleteAllStyleSets()
{
    let listUrl = argv.baseUrl;
    let listParams = {
        'api-version': '2022-01-01-preview'
    };
    if (argv.useMdp)
    {
        listUrl += mdpApiPath;
        listParams = {...mdpQueryParams, ...listParams};
    }
    listUrl += styleSetsPath;

    axios.get(
        listUrl,
        {
            headers: {
                ...authHeaders
            },
            params: listParams
        }
    )
    .then(function (response) {
        filesToDelete = response.data.styleSets.map((styleSet) => styleSet.styleSetId);
        filesDeleted = 0;

        if (filesDeleted < filesToDelete.length)
        {
            listUrl += '/' + filesToDelete[filesDeleted];
            outputLog(`Deleting ${filesToDelete[filesDeleted]}`);
            filesDeleted++;

            axios.delete(
                listUrl,
                {
                    headers: {
                        ...authHeaders
                    },
                    params: listParams
                }
            )
            .then(callbackFn)
            .catch(function (error) {
                outputLog(error);
            });
        }
    })
    .catch(function (error) {
        outputLog(error);
    });
}
// #endregion

getAndDeleteAllStyleSets();
