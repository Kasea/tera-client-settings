const EventEmitter = require('events');
const { parseSettings, packSettings } = require("./utils/protobufs/index");


module.exports = class ClientSettings extends EventEmitter {
    constructor(mod) {
        super();
        this.setMaxListeners(0);

        this.mod = mod;
        this._packets = {};
        this.hookPackets(mod);
    }

    saveState() {
        return this._packets;
    }

    loadState(state) {
        this._packets = state;
    }

    hookPackets(mod) {
        const handlePacket = name => {
            mod.hook(name, 1, e=> {
                const settings = parseSettings(e.data);
                this._packets[name] = settings;

                this.emit("update", name, this._packets);
            });
        }

        handlePacket("S_LOAD_CLIENT_ACCOUNT_SETTING");
        handlePacket("S_LOAD_CLIENT_USER_SETTING");
        handlePacket("C_SAVE_CLIENT_ACCOUNT_SETTING");
        handlePacket("C_SAVE_CLIENT_USER_SETTING");
    }

    createRawData(settings) {
        return packSettings(settings);
    }

    get accountSettings() {
        return JSON.parse(JSON.stringify({
            ...(this._packets.S_LOAD_CLIENT_ACCOUNT_SETTING || {}),
            ...(this._packets.C_SAVE_CLIENT_ACCOUNT_SETTING || {})
        }));
    }

    get userSettings() {
        return JSON.parse(JSON.stringify({
            ...(this._packets.S_LOAD_CLIENT_USER_SETTING || {}),
            ...(this._packets.C_SAVE_CLIENT_USER_SETTING || {})
        }));
    }

    get settings() {
        return {
            ...this.accountSettings,
            ...this.userSettings
        };
    }
}

