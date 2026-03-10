const fs=require("fs");
const path=require("path");

const CACHE=path.join(__dirname,"..","data","war_cache.json");

function readJson(file){
 try{
  return JSON.parse(fs.readFileSync(file,"utf8"));
 }catch{
  return {};
 }
}

async function checkWarAlerts(client){

 const war=readJson(CACHE);

 const planets=war?.status?.planetStatus||[];

 const critical=planets.filter(p=>p.liberation>90);

 if(!critical.length) return;

 const channel=client.channels.cache.find(
  c=>c.name==="high-command-dispatch"
 );

 if(!channel) return;

 for(const p of critical){

 channel.send(`
⚠ **HIGH COMMAND ALERT**

${p.name} nearing liberation.

All Vanguard divisions deploy immediately.

For Super Earth.
`);

 }

}

module.exports={checkWarAlerts};