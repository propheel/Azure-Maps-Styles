const axios = require('axios');
const fs = require("fs-extra");
const path = require("path");
const qs = require("qs");
const yargs = require("yargs");

// #region Yargs
const argv = yargs
    .version(false)
    .usage("Uploads default style recipes to the server.")
    .group(["input", "baseUrl", "useMdp", "log"], "Files:")
    .option("input", {
        alias: "i",
        describe: "The input style recipe file(s), can be the path to a single file or a directory with multiple\n" +
            "style recipe files. If a directory is specified all the style recipe files will be used.",
        type: "string",
        demandOption: true,
        normalize: true
    })
    .option("baseUrl", {
        alias: "url",
        describe: "Set base protocol and domain to be used.",
        type: "string"
    })
    .option("useMdp", {
        alias: "mdp",
        describe: "Use MDP endpoint URLs instead of LBS. Useful for running script locally.",
        type: "boolean"
    })
    .option("log", {
        describe: "The file path to output the run log to. If not log file is specified will output to stdout.",
        type: "string",
        normalize: true
    })
    .check((argv) => {
        if (!fs.existsSync(argv.input)) {
            throw new Error("ERROR: The input style recipe file or directory does not exist.");
        }
        return true;
    })
    .help()
    .wrap(yargs.terminalWidth())
    .argv;
// #endregion

// #region Constants, env, etc
const mdpApiPath = '/TilesetAPI';
const createStyleRecipeOperation = '/styles/styleRecipes';
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

let filesToUpload = [];
let filesUploaded = 0;
// #endregion

// #region Helper functions
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

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
    if (response.status == 202) {
        const statusUrl = response.headers['operation-location'];
        outputLog(`Got operation location: ${statusUrl}`);
        let urlParts = statusUrl.split('?');
        let requestUrlParts = urlParts[0].split(createStyleRecipeOperation);
        let requestUrl = argv.baseUrl;
        let createStyleRecipeOperationParams = qs.parse(urlParts[1]);
        if (argv.useMdp)
        {
            requestUrl += mdpApiPath;
            createStyleRecipeOperationParams = {...mdpQueryParams, ...createStyleRecipeOperationParams};
        }
        requestUrl += createStyleRecipeOperation + requestUrlParts[1];
        delay(1000).then(() =>
        {
            axios.get(
                requestUrl,
                {
                    headers: {
                        ...authHeaders
                    },
                    params: createStyleRecipeOperationParams
                }
            )
            .then(callbackFn)
            .catch(function (error) {
                outputLog(error);
            });
        });
    }
    else if (response.status == 200)
    {
        const resHeaders = response.headers;
        outputLog(`Got operation status: ${response.data.status}`);
        if (!resHeaders['resource-location'])
        {
            let urlParts = response.request.path.split('?');
            let requestUrl = response.request.protocol + '//' + response.request.host + urlParts[0];
            let createStyleRecipeOperationParams = qs.parse(urlParts[1]);
            if (argv.useMdp)
            {
                createStyleRecipeOperationParams = {...mdpQueryParams, ...createStyleRecipeOperationParams};
            }
            delay(1000).then(() =>
            {
                axios.get(
                    requestUrl,
                    {
                        headers: {
                            ...authHeaders
                        },
                        params: createStyleRecipeOperationParams
                    }
                )
                .then(callbackFn)
                .catch(function (error) {
                    outputLog(error);
                });
            });
        }
        else
        {
            outputLog(`Uploaded to: ${resHeaders['resource-location']}`);
            filesUploaded++;
            if (filesUploaded < filesToUpload.length)
            {
                uploadStyleRecipe(filesToUpload[filesUploaded]);
            }
        }
    }
    else
    {
        outputLog(error);
        outputLog("Error - unexpected status");
    }
}

function uploadStyleRecipe(filePath)
{
    outputLog(`Posting file: ${filePath}`);
    let fileExt = path.extname(filePath); // ".json"
    let fileType = fileExt.split('.')[1]; // "json"
    let fileName = path.basename(filePath, fileExt); // "blank_2021-02-01_base"

    let createUrl = argv.baseUrl;
    let createStyleRecipeParams = {
        'api-version': '2022-01-01-preview',
        'dataFormat': fileType,
        'styleFormat': 'azureMapsStyleRecipe',
        'alias': 'microsoft-maps:' + fileName,
        'description': ''
    };
    if (argv.useMdp)
    {
        createUrl += mdpApiPath;
        createStyleRecipeParams = {...mdpQueryParams, ...createStyleRecipeParams};
    }
    createUrl += createStyleRecipeOperation;

    axios.post(
        createUrl,
        fs.readFileSync(filePath),
        {
            headers: {
                ...authHeaders,
                'content-type': 'application/' + fileType,
                'content-length': fs.lstatSync(filePath).size,
            },
            params: createStyleRecipeParams
        }
    )
    .then(callbackFn)
    .catch(function (error) {
        outputLog(error);
    });
}
// #endregion

// Decide if input path is a directory or a single style recipe
const inputIsDir = fs.lstatSync(argv.input).isDirectory();
if (!inputIsDir)
{
    filesToUpload.push(argv.input);
}
else
{
    styleRecipeFiles = fs.readdirSync(argv.input)
    .filter((item) =>
        (item.toLowerCase().endsWith(".json") || item.toLowerCase().endsWith(".zip")) &&
        fs.lstatSync(`${argv.input}/${item}`).isFile()
    )
    .forEach((item) => filesToUpload.push(`${argv.input}/${item}`));
}

if (filesUploaded < filesToUpload.length)
{
    uploadStyleRecipe(filesToUpload[filesUploaded]);
}
