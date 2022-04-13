const archiver = require('archiver');
const fs = require("fs-extra");
const path = require("path");
const yargs = require("yargs");

// #region Yargs
const argv = yargs
    .version(false)
    .usage("Creates ZIP files including style set and related thumbnails.")
    .group(["input", "thumbnails", "output", "log"], "Files:")
    .option("input", {
        alias: "i",
        describe: "The input style set file(s), can be the path to a single file or a directory with multiple\n" +
            "style set files. If a directory is specified all the style set files will be used.",
        type: "string",
        demandOption: true,
        normalize: true
    })
    .option("thumbnails", {
        alias: "t",
        describe: "The path to a directory with thumbnails files.",
        type: "string",
        normalize: true
    })
    .option("output", {
        alias: "o",
        describe: "The path to output the merged file(s) to, can be the path to a single file or a directory.\n" +
            "If base is the path to a directory then output will be treated as one too",
        type: "string",
        normalize: true
    })
    .option("log", {
        describe: "The file path to output the run log to. If not log file is specified will output to stdout.",
        type: "string",
        normalize: true
    })
    .check((argv) => {
        if (!fs.existsSync(argv.input)) {
            throw new Error("ERROR: The input style set file or directory does not exist.");
        }
        return true;
    })
    .help()
    .wrap(yargs.terminalWidth())
    .argv;
// #endregion

// #region Constants
// #endregion

// Decide if input path is a directory or a single style set
let styleSetFiles = [];
let inputDirPath = argv.input;
const inputIsDir = fs.lstatSync(argv.input).isDirectory();
if (!inputIsDir)
{
    inputDirPath = path.dirname(argv.input);
    if (argv.input.toLowerCase().endsWith(".json"))
    {
        styleSetFiles.push(path.basename(argv.input.toLowerCase(), ".json"));
    }
}
else
{
    styleSetFiles = fs.readdirSync(inputDirPath)
    .filter((item) =>
        item.toLowerCase().endsWith(".json") &&
        fs.lstatSync(`${inputDirPath}/${item}`).isFile()
    )
    .map((file) => path.basename(file.toLowerCase(), ".json"));
}

// Process files
let promises = [];
styleSetFiles.forEach((styleSetFile) => {
    promises.push(zipStyleSetWithThumbnails(inputDirPath, styleSetFile, argv.thumbnails, argv.output));
});

Promise.all(promises)
.catch(err => {
    outputLog(err);
});


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

/**
 * @param {String} styleSetDirectory: /path/to/styleSets
 * @param {String} styleSetFileName
 * @param {String} thumbnailsDirectory: /path/to/thumbnails
 * @param {String} outPath: /path/to/created.zip
 * @returns {Promise}
 */
async function zipStyleSetWithThumbnails(styleSetDirectory, styleSetFileName, thumbnailsDirectory, outPath) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(`${outPath}/${styleSetFileName}.zip`);

    return new Promise((resolve, reject) => {
        archive
        .file(`${styleSetDirectory}/${styleSetFileName}.json`, { name: `${styleSetFileName}.json` })
        .on('error', err => reject(err))
        .pipe(stream)
        ;

        let styleSet = JSON.parse(fs.readFileSync(`${styleSetDirectory}/${styleSetFileName}.json`));
        let thumbnailNames = new Set();
        if (styleSet.styles && Array.isArray(styleSet.styles))
        {
            styleSet.styles.forEach((style) => {
                if (style.thumbnail && typeof style.thumbnail === "string")
                {
                    thumbnailNames.add(style.thumbnail);
                }
            });
        }

        [...thumbnailNames]
        .filter((thumbnail) => fs.lstatSync(`${thumbnailsDirectory}/${thumbnail}`).isFile())
        .forEach((thumbnail) => archive.file(`${thumbnailsDirectory}/${thumbnail}`, { name: thumbnail }));

        stream.on('close', () => resolve());
        archive.finalize();
    });
}
// #endregion