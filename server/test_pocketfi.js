const http = require('https');
fetch('https://documenter.getpostman.com/view/28150108/2sAYkGKJuf').then(r=>r.text()).then(t => {
  const matches = t.match(/https:\/\/api\.pocketfi\.ng\/api\/v1[a-zA-Z0-9\/\-_]+/g);
  if (matches) {
    console.log([...new Set(matches)]);
  } else {
    console.log("No matches found.");
  }
});
