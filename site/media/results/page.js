/* Editorial config for the results page and the results video. Edit this file, not the page.
   show: which findings appear. A finding left out is removed from the page; the page order is the order of
   the sections in index.html.
   race: the two runs the race opens on (keys of results.json runs). Left empty, it opens on the run with the
   median token total among the finished runs of each arm (groups.<arm>.medianRun), a rule that no one picks. */
var crPage = {
  show: ["idle", "finish", "race", "tokens", "cost", "predict"],
  race: null
};
