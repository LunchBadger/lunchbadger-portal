var fs = require('fs');
var path = require('path');

var express = require('express');
var ejs = require('ejs');
var compression = require('compression');

var shins = require('./index.js');

const request = require('request');
const converter = require('widdershins');

var app = express();
app.use(compression());

app.set('view engine', 'html');
app.engine('html', ejs.renderFile);

function check(req,res,fpath) {
	fpath = fpath.split('/').join('');
	var srcStat = fs.statSync(path.join(__dirname,'source',fpath+'.md'));
	var dstStat = {mtime:0};
	try {
		dstStat = fs.statSync(path.join(__dirname,fpath));
	}
	catch (ex) { }
	if (srcStat.mtime>dstStat.mtime) {
		console.log('Rebuilding '+fpath);
		fs.readFile(path.join(__dirname,'source',fpath+'.md'),'utf8',function(err,markdown){
			if (markdown) {
				// TODO at the moment there's no way to specify customcss etc
				shins.render(markdown,{},function(err,html){
					res.send(html);
					fs.writeFile(path.join(__dirname,fpath),html,'utf8',function(){});
				});
			}
		});
	}
	else {
		res.render(path.join(__dirname,fpath));
	}
}

app.get('/', function(req,res) {
	check(req,res,'index.html');
});
app.get('*.html', function(req,res) {
	check(req,res,req.path);
});
app.use("/",  express.static(__dirname));

var myport = process.env.PORT || 4567;
if (process.argv.length>2) myport = process.argv[2];

var server = app.listen(myport, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Arapaho server listening at http://%s:%s', host, port);
  monitorOpenAPIURL();
});

let lastKnownETag = null;
function monitorOpenAPIURL() {
  setInterval(() => {
    const options = {
      method: 'GET',
      url: process.env.OPENAPI_URL || 'http://localhost:3000/explorer/swagger.json',
      json: true
    }

    if (lastKnownETag !== null) {
      options.headers= {
        'If-None-Match': lastKnownETag
      };
    }

    request(options, (err, res, body) => {
      if (err) {
        console.error(err);
        return;
      }

      if (res.statusCode === 200) {
        lastKnownETag = res.headers['etag'];

        body.basePath = process.env.BASE_PATH || 'http://demo-dev.lunchbadger.io';

        converter.convert(body, {}, (err, str) => {
          const indexFile = path.join(__dirname, 'source', 'index.html.md');
          fs.writeFile(indexFile, str, err => {
            if (err) {
              console.error(err);
              return;
            }
            console.log(`new file written [etag: ${lastKnownETag}]`);
          });
        });
      }
    });
  }, process.env.POLL_INTERVAL || 3000);
}
