const http = require('https');
fetch('https://documenter.getpostman.com/view/28150108/2sAYkGKJuf').then(r=>r.text()).then(t => {
  const fs = require('fs');
  fs.writeFileSync('postman_docs.html', t);
  console.log("Written to postman_docs.html");
});