const zlib = require('zlib');
const path = require("path");
const { get_all_files } = require("../index");
const protobuf = require('protobufjs');
const util = require("util");

const updateProto = false;
let __extraExports = {};
try {
    delete require.cache[require.resolve("./private")];
}catch(e) {}
try {
    __extraExports = require("./private");
}catch(e) {}

const PROTO_PREFIX = "TeraSettings";
let root = null;

function loadRoot() {
    return get_all_files(path.join(__dirname, "proto"))
    .then(files=> {
        root = protobuf.loadSync(files);
    }).catch(e=> console.error(e));
    //root = protobuf.loadSync(__dirname + "/proto/Settings.proto")
}
loadRoot();


function fixCommonField(proto, {name, type}, unpack, overwriteValue) {
    let val = proto[name];
    if(overwriteValue !== undefined) {
        val = overwriteValue;
    }
    if(Array.isArray(val)) {
        return val.map(val=> fixCommonField(proto, {name, type}, unpack, val));
    }

    // convert to BigInt
    if(["int64", "uint64"].includes(type)) {
        if(unpack) return (Number(val.high || 0) << 32) | Number(val.low || 0);
    }

    // convert to string
    if(type === "string") {
        //if(unpack) return Buffer.from(val, "utf16le").toString(); //val.replace(/\x00/gm, "");
        if(unpack) {
            return Buffer.from(val, "utf-8").toString("utf16le");
        } else {
            return Buffer.from(val, "utf16le").toString("utf-8");
        }
    }

    return val;
}

function fixFieldsInProto(proto, unpack=true) {
    if(!proto || !proto.$type) return proto;

    for(const { name, type, resolvedType, repeated } of proto.$type.fieldsArray) {
        const val = proto[name];

        // if it resolves to another proto
        if(resolvedType) {
            if(repeated) val.forEach(val=> fixFieldsInProto(val, unpack));
            else fixFieldsInProto(val, unpack);
        } else {
            proto[name] = fixCommonField(proto, {name, type}, unpack);
        }
    }
    return proto;
}

function getProto(proto) {
    return root.lookupType(`${PROTO_PREFIX}.${proto}`);
}

function populateSettingsWithPayload(settings, rawData=false) {
    for(const setting of settings.data) {

        setting.name = fixCommonField(setting, {name: "name", type: "string"}, true);
        if(setting.compressed) {
            setting.data = zlib.inflateSync(setting.data);
        } 

        if(setting.data.length !== setting.length) {
            console.warn(`convertProto warning: Expected size: ${setting.length}, got size: ${setting.data.length}. Zipped: ${setting.compressed}`);
        }

        if(rawData) continue;

        try {
            const proto = getProto(setting.name);
            const data = proto.decode(setting.data);
            fixFieldsInProto(data, true);
            setting.data = data;
        }catch(e) {
            console.error(`Invalid proto: ${setting.name}`);
            console.error(e);
        }
    }
    return settings;
}

function parseRawSettings(payload) {
    const proto = getProto(`Settings`);
    const settings = proto.decode(payload);
    populateSettingsWithPayload(settings, true);
    return settings;
}

async function parseSettings(payload) {
    if(updateProto) {
        await __extraExports.writeBlobs(payload);
        await __extraExports.createProtos();
        await loadRoot();
    }
    const proto = getProto(`Settings`);
    const settings = proto.decode(payload);
    populateSettingsWithPayload(settings)
    return settings.data.reduce((acc, {data, ...header})=> {
        const name = header.name;
        acc[name] = data.toJSON();
        acc[name]._header = header;
        return acc;
    }, { fld1: settings.fld1, fld2: settings.fld2 });
}

function packSettings({ fld1=-1, fld2="", ...data }) {
    const proto = getProto(`Settings`);

    let settings = {fld1, fld2, data: []};

    settings.data = Object.entries(data).map(([name, {_header, ...payload}])=> {
        const setting = {..._header};
        setting.name = fixCommonField(setting, { name: "name", type: "string" }, false);

        const proto = getProto(name);
        setting.data = proto.fromObject(payload);
        fixFieldsInProto(setting.data, false);
        setting.data = proto.encode(setting.data).finish();
        setting.length = setting.data.length;
        if(setting.compressed) {
            setting.data = zlib.deflateSync(setting.data);
        }

        return setting;
    });
    
    const err = proto.verify(settings);
    if(err) {
        console.error("Invalid main proto");
        console.error(settings);
        throw new Error(err);
    }
    return proto.encode(settings).finish();
}


function toString(proto) {
    return util.inspect(proto, false, null, false);
}

module.exports = {
    parseSettings,
    parseRawSettings,
    packSettings,
    toString,
    ...__extraExports
};
