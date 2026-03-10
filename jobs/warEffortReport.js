const fs = require("fs");
const path = require("path");

const TRACKER = path.join(__dirname, "..", "tracker_store.json");

function readJson(file){
 try{
  return JSON.parse(fs.readFileSync(file,"utf8"));
 }catch{
  return {};
 }
}

async function postWarEffort(client){

 const tracker = readJson(TRACKER);

 const planets = tracker.planets || {};
 const divisions = tracker.weekly?.divisions || {};
 const enemies = tracker.weekly?.enemies || {};

 const topPlanets = Object.entries(planets)
 .sort((a,b)=>b[1].missions-a[1].missions)
 .slice(0,3);

 const topDivisions = Object.entries(divisions)
 .sort((a,b)=>b[1]-a[1])
 .slice(0,3);

 const topEnemies = Object.entries(enemies)
 .sort((a,b)=>b[1]-a[1])
 .slice(0,3);

 const channel = client.channels.cache.find(
  c=>c.name==="vanguard-war-effort"
 );

 if(!channel) return;

 channel.send(`
📡 **WAR EFFORT REPORT**

🪐 Top Planets
${topPlanets.map(p=>`${p[0]} — ${p[1].missions}`).join("\n")}

🛡 Division Effort
${topDivisions.map(d=>`${d[0]} — ${d[1]}`).join("\n")}

👾 Enemy Front
${topEnemies.map(e=>`${e[0]} — ${e[1]}`).join("\n")}
`);
}

module.exports = {postWarEffort};