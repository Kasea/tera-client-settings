const exec = require("util").promisify(require("child_process").exec);
const { get_all_files, write_file, read_file } = require("../index");
const path = require("path");

async function writeBlobs(payload) {
    const { parseRawSettings } = require("./index");

    const settings = await parseRawSettings(payload);
    for(const setting of settings.data) {
        await write_file(path.join(__dirname, `/blobs/${setting.name}`), setting.data, false);
    }
}

const messageRegex = /MSG([0-9]*)/gm;
const requiredRegex = /required/gm;
const packageRegex = /package ProtodecMessages;/gm;

async function createProtos() {
    const files = await get_all_files(path.join(__dirname, "blobs"));
    for(const file of files) {
        const fileName = path.parse(file).name;
        let res = null;
        try {
            res = await exec(`protodec.exe --schema ${file}`, {
                cwd: path.join(__dirname, "./")
            });
        }catch(e) {
            console.error("Failed to update the following file:", file);
            console.error(e);
            continue
        }
        for(let i = 100; i > 0; i--) {
            const msg = `message MSG${i}`;
            if(res.stdout.includes(msg)) {
                let output = res.stdout.replace(msg, `message ${fileName}`);
                output = output.replace(messageRegex, (_, idx)=> `${fileName}_${idx}`);
                output = output.replace(requiredRegex, ()=> "optional");
                output = output.replace(packageRegex, ()=> "package TeraSettings;");
                await write_file(path.join(__dirname, `/new_proto/${fileName}.proto`), output, false);
                await copyFieldNames(fileName);
                break;
            }
        }
    }
}

function createMapOfFields(data="") {
    let ret = {}
    const rgx = /([A-Za-z0-9_]*) ([A-Za-z0-9_]*) ([A-Za-z0-9_]*) = ([0-9]*);/gm;
    let value = null;
    while((value = rgx.exec(data)) !== null) {
        const [, requireStatus, type, name, id] = value;
        ret[id] = {type, name, id, requireStatus};
    }
    return ret;
}

function createMessageEntriesFromMap(map) {
    let data = "";
    const keys = Object.keys(map).sort((a, b)=> +a - +b);
    
    for(const key of keys) {
        const { requireStatus, type, name, id } = map[key];
        data += `	${requireStatus} ${type} ${name} = ${id};${keys.indexOf(key) === keys.length - 1 ? "" : "\n"}`;
    }

    return data;
}

function findMessageNames(data, regex) {
    let ret = [];
    let value = null;
    while((value = regex.exec(data)) !== null) {
        ret.push(value[1]);
    }
    return ret;
}

async function copyFieldNames(fileName) {
    let newData = await read_file(path.join(__dirname, `/new_proto/${fileName}.proto`));
    let oldData = await read_file(path.join(__dirname, `/proto/${fileName}.proto`));
    oldData = oldData.replace(requiredRegex, ()=> "optional");
    oldData = oldData.replace(packageRegex, ()=> "package TeraSettings;");

    const rgx = new RegExp(`(message ${fileName}[_A-Za-z0-9]* {)`, "gm");
    const messageNames = findMessageNames(newData, rgx);

    for(const messageName of messageNames) {
        const newIdx = newData.indexOf(messageName);
        const newEnd = newData.indexOf("\n}", newIdx) + 2;
        const oldIdx = oldData.indexOf(messageName);

        if(oldIdx === -1) {
            oldData += `\n${newData.slice(newIdx, newEnd)}\n`;
            continue;
        }
        const oldEnd = oldData.indexOf("\n}", oldIdx) + 2;

        const newMap = createMapOfFields(newData.slice(newIdx, newEnd));
        let oldMap = createMapOfFields(oldData.slice(oldIdx, oldEnd));

        for(const key in newMap) {
            if(oldMap[key] === undefined) {
                oldMap[key] = newMap[key];
                continue;
            }
        }

        const finalData = createMessageEntriesFromMap(oldMap);
        oldData = `${oldData.slice(0, oldIdx)}${messageName}\n${finalData}\n}${oldData.slice(oldEnd, oldData.length - 1)}\n`;
    }

    await write_file(path.join(__dirname, `/proto/${fileName}.proto`), oldData, false);
}


module.exports = {
    writeBlobs,
    createProtos,
};
