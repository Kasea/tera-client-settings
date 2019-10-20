const path = require("path");
const fsAsync = require("fs").promises;

async function write_file(file_path, data, json=true) {
    await fsAsync.mkdir(path.dirname(file_path), { recursive: true });
    if(json) await fsAsync.writeFile(file_path, JSON.stringify(data, null, "    "));
    else await fsAsync.writeFile(file_path, data);
}

/**
 * Returns a list of all the files in the directory and its sub directories
 * @param {*} dir 
 * @param {*} files_ 
 */
async function get_all_files(dir, files_){
    files_ = files_ || [];
    let files = await fsAsync.readdir(dir);
    for (let i in files){
        let name = dir + '/' + files[i];
        if ((await fsAsync.stat(name)).isDirectory()){
            await get_all_files(name, files_);
        } else {
            files_.push(name);
        }
    }
    return files_;
}



module.exports = {
    write_file,
    get_all_files
};
