const archiver = require('archiver');
const fs = require("fs-extra");
const path = require("path");
const yargs = require("yargs");

// #region Yargs
const argv = yargs
    .version(false)
    .usage("Creates ZIP files including style recipe and related sprite sheets.")
    .group(["input", "spriteSheet", "output", "log"], "Files:")
    .option("input", {
        alias: "i",
        describe: "The input style recipe file(s), can be the path to a single file or a directory with multiple\n" +
            "style recipe files. If a directory is specified all the style recipe files will be used.",
        type: "string",
        demandOption: true,
        normalize: true
    })
    .option("spriteSheet", {
        alias: "s",
        describe: "The path to a directory with sprite sheet files.",
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
            throw new Error("ERROR: The input style recipe file or directory does not exist.");
        }
        return true;
    })
    .help()
    .wrap(yargs.terminalWidth())
    .argv;
// #endregion

// #region Constants
const spriteSheets = {
    dark: "dark_2018-06-26",
    grayscale: "grayscale_2021-05-25",
    indoor: "indoor_2019-04-15",
    road: "road_2018-05-31"
};

const recipeSpriteSheetMap = {
    'blank_accessible_2021-02-01_labels': "road",
    'blank_accessible_2021-02-01_labels_places': "road",
    'grayscale_dark_2021-02-01_labels': "dark",
    'grayscale_dark_2021-02-01_labels_places': "dark",
    'grayscale_dark_2021-02-01_transit': "dark",
    'grayscale_light_2021-02-01_labels': "dark",
    'grayscale_light_2021-02-01_labels_places': "dark",
    'grayscale_light_2021-02-01_transit': "dark",
    'high_contrast_dark_2021-02-01_labels': "dark",
    'high_contrast_dark_2021-02-01_labels_places': "dark",
    'high_contrast_dark_2021-02-01_transit': "dark",
    'high_contrast_light_2021-02-01_labels': "grayscale",
    'high_contrast_light_2021-02-01_labels_places': "grayscale",
    'high_contrast_light_2021-02-01_transit': "grayscale",
    'indoor_2019-04-15_labels': "indoor",
    'indoor_dark_2019-04-15_labels': "indoor",
    'night_2021-02-01_labels': "road",
    'night_2021-02-01_labels_places': "road",
    'night_2021-02-01_transit': "road",
    'road_2021-02-01_labels': "road",
    'road_2021-02-01_labels_places': "road",
    'road_2021-02-01_transit': "road",
    'road_shaded_relief_2021-02-01_labels': "road",
    'road_shaded_relief_2021-02-01_labels_places': "road",
    'road_shaded_relief_2021-02-01_transit': "road",
    'satellite-hybrid_2021-02-01_labels': "road",
    'satellite-hybrid_2021-02-01_labels_places': "road",
    'satellite-hybrid_2021-02-01_transit': "road",
    'satellite_2021-02-01_labels': "road",
    'satellite_2021-02-01_labels_places': "road"
};
// #endregion

// Decide if input path is a directory or a single style recipe
let styleRecipeFiles = [];
let inputDirPath = argv.input;
const inputIsDir = fs.lstatSync(argv.input).isDirectory();
if (!inputIsDir)
{
    inputDirPath = path.dirname(argv.input);
    if (argv.input.toLowerCase().endsWith(".json"))
    {
        styleRecipeFiles.push(path.basename(argv.input.toLowerCase(), ".json"));
    }
}
else
{
    styleRecipeFiles = fs.readdirSync(inputDirPath)
    .filter((item) =>
        item.toLowerCase().endsWith(".json") &&
        fs.lstatSync(`${inputDirPath}/${item}`).isFile()
    )
    .map((file) => path.basename(file.toLowerCase(), ".json"));
}

// Process files
let promises = [];
styleRecipeFiles.forEach((styleRecipeFile) => {
    if (recipeSpriteSheetMap[styleRecipeFile])
    {
        promises.push(zipStyleRecipeWithSpriteSheets(inputDirPath, styleRecipeFile, argv.spriteSheet, argv.output));
    }
    else
    {
        promises.push(fs.copyFile(`${inputDirPath}/${styleRecipeFile}.json`, `${argv.output}/${styleRecipeFile}.json`));
    }
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
 * @param {String} styleRecipeDirectory: /path/to/styleRecipes
 * @param {String} styleRecipeFileName
 * @param {String} spriteSheetDirectory: /path/to/spriteSheets
 * @param {String} outPath: /path/to/created.zip
 * @returns {Promise}
 */
async function zipStyleRecipeWithSpriteSheets(styleRecipeDirectory, styleRecipeFileName, spriteSheetDirectory, outPath) {
    const archive = archiver('zip', { zlib: { level: 9 }});
    const stream = fs.createWriteStream(`${outPath}/${styleRecipeFileName}.zip`);

    return new Promise((resolve, reject) => {
        archive
        .file(`${styleRecipeDirectory}/${styleRecipeFileName}.json`, { name: `${styleRecipeFileName}.json` })
        .on('error', err => reject(err))
        .pipe(stream)
        ;

        let spriteSheetName = spriteSheets[recipeSpriteSheetMap[styleRecipeFileName]];
        outputLog(spriteSheetName);

        fs.readdirSync(spriteSheetDirectory)
            .filter((item) =>
                item.startsWith(spriteSheetName) &&
                fs.lstatSync(`${spriteSheetDirectory}/${item}`).isFile()
            )
            .forEach((file) => {
                archive.file(`${spriteSheetDirectory}/${file}`, { name: file });
            });

        stream.on('close', () => resolve());
        archive.finalize();
    });
}
// #endregion