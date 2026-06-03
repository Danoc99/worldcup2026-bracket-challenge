import fs from "fs";
// football-data.org names as they realistically appear (deliberately tricky)
const G = {
  GROUP_A: ["Mexico","Korea Republic","South Africa","Czech Republic"],
  GROUP_B: ["Canada","Switzerland","Qatar","Bosnia-Herzegovina"],
  GROUP_C: ["Brazil","Scotland","Morocco","Haiti"],
  GROUP_D: ["USA","Paraguay","Australia","Türkiye"],
  GROUP_E: ["Germany","Ecuador","Côte d'Ivoire","Curaçao"],
  GROUP_F: ["Netherlands","Japan","Tunisia","Sweden"],
  GROUP_G: ["Belgium","IR Iran","Egypt","New Zealand"],
  GROUP_H: ["Spain","Uruguay","Saudi Arabia","Cabo Verde"],
  GROUP_I: ["France","Norway","Senegal","Iraq"],
  GROUP_J: ["Argentina","Austria","Algeria","Jordan"],
  GROUP_K: ["Portugal","Colombia","Uzbekistan","Congo DR"],
  GROUP_L: ["England","Croatia","Ghana","Panama"],
};
const standings = Object.entries(G).map(([group, teams]) => ({
  stage: "GROUP_STAGE", type: "TOTAL", group,
  table: teams.map((name, i) => ({
    position: i + 1,
    team: { id: 1000 + i, name, tla: null, crest: "" },
    playedGames: group === "GROUP_A" ? 3 : 2,   // A is "finished", rest "live"
    points: 9 - i * 2, goalsFor: 5, goalsAgainst: i, goalDifference: 5 - i,
  })),
}));
fs.writeFileSync("test/fixtures/wc-standings.json", JSON.stringify({ standings }, null, 2));
console.log("fixture written");
