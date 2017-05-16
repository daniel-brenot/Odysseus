//Network scanner
//Aidan Crowther - 11/5/2017

//import utilities
var fs = require('fs');
var express = require('express');
var app = express();
var evilscan = require('evilscan');
var ip = require('ip');
var bodyParser = require('body-parser');

//program constants
const ROOT = './interface';
const PORT = 8080;
const IP = ip.address();

//global variables
var allIps = {};

//static file server
var urlEncodedParser = bodyParser.urlencoded({ extended: true });
app.use(express.static('interface'));

//respond to request for index.html
app.get('/', function(req, res){
    res.sendfile( ROOT + '/index.html');
});

//update hosts upon receiving get request for /update
app.get('/update', function(req, res){
    var config = JSON.parse(fs.readFileSync('config.json'));
    var portList = JSON.parse(fs.readFileSync('ports.json'));
    var options = {};
    var ipRange = config['ipScanStart']+'-'+config['ipScanEnd'];
    var ports = '';
    var domain = config['domain'];
    var ipOmit = config['ipOmit'];
    var ipForce = config['ipForce'];
    var ignoreHost = config['ignoreHost'];
    var thumbnails = {};
    var redirects = config['redirect'];
    var omitHosts = config['omitHosts'];

    allIps = {};

    //scan for thumbnails
    var images = fs.readdirSync('./interface/images');
    for(var image in images){
        var current = images[image].split('.')[0];
        if(thumbnails[current]) thumbnails[current].push(images[image]);
        else thumbnails[current] = [images[image]];
    }

    //set the scanners options
    options['target'] = ipRange;
    for(var port in config['ports']){
        if(port != config['ports'].length-1) ports += config['ports'][port]+', ';
        else ports += config['ports'][port];
    }

    options['port'] = ports;
    options['reverse'] = true;
    options['json'] = true;

    var results = [];
    var scanner = new evilscan(options);

    //Run the scanner and parse results
    scanner.on('result', function(data){
        allIps[data['ip']] = data;
        allIps[data['ip']]['omit'] = false;
        allIps[data['ip']]['forced'] = false;
        if(data['reverse']) if(data['reverse'].includes('.')) allIps[data['ip']]['reverse'] = allIps[data['ip']]['reverse'].split('.')[0];
        if(ipOmit.includes(data['ip']) || omitHosts.includes(data['reverse'])) allIps[data['ip']]['omit'] = true;
        if(ipForce.includes(data['ip'])) allIps[data['ip']]['forced'] = true;
        //ignoreHost if set true
        if(ignoreHost && data['ip'] === IP);
        //ignore devices without a hostname, unless they have been whitelisted
        else if(data.hasOwnProperty('reverse') || ipForce.indexOf(data['ip']) >= 0) if(omitHosts.indexOf(data['reverse']) < 0 && ipOmit.indexOf(data['ip']) < 0){
            //set the name field of whitelisted servers to their IP
            if(ipForce.indexOf(data['ip']) >= 0) data['reverse'] = data['ip'];
            //strip host domain from names
            if(data['reverse'].includes('.'+domain)) data['reverse'] = data['reverse'].split('.')[0];
            results.push(data);
        }
    });
    scanner.on('error', function(err){ console.log(err); });
    scanner.on('done', function(){
        var devices = {};
        for(var device in results) {
            var current = results[device];
            //write hosts to json object, removing duplicates
            if (!devices[current['reverse']]) {
                devices[current['reverse']] = current;
                devices[current['reverse']]['port'] = current['port'];
                devices[current['reverse']]['thumbnails'] = [];
            }
            else devices[current['reverse']]['port'] += ', ' + current['port'];
            for (var port in portList) {
                if (current['port'] == (portList[port])) {
                    if(thumbnails.hasOwnProperty(port)) devices[current['reverse']]['thumbnails'].push(thumbnails[port][0]);
                    if(redirects.hasOwnProperty((current['reverse']))){
                        if(redirects[current['reverse']][0] == portList[port]){
                            var toRedirect = String(devices[current['reverse']]['port']);
                            devices[current['reverse']]['port'] = toRedirect.replace(redirects[current['reverse']][0], redirects[current['reverse']][0]+redirects[current['reverse']][1]);
                        }
                    }
                }
            }
        }
        //write hosts to hosts.json
        fs.writeFile('hosts.json', JSON.stringify(devices), function(err){
            if(err) res.sendStatus(500);
        });
        //write ips to ips.json
        fs.writeFile('ips.json', JSON.stringify(allIps), function(err){
            if(err) res.sendStatus(500);
        });
        res.sendStatus(200);
    });
    scanner.run();
});

//update config settings
app.post('/update', urlEncodedParser, function(req, res){
    fs.writeFile('config.json', JSON.stringify(req.body['config']), function(err){
        if(err) res.sendStatus(500);
        fs.writeFile('ports.json', JSON.stringify(req.body['portList']), function(err){
            if(err) res.sendStatus(500);
            res.sendStatus(200);
        });
    });
});

//respond to request for host list
app.get('/hosts', function(req, res){
    res.send(JSON.parse(fs.readFileSync('hosts.json')));
});

//respond to requests for port types
app.get('/ports', function(req, res){
    res.send(JSON.parse(fs.readFileSync('ports.json')));
});

//return a list of all ips within the range, regardless of config
app.get('/ips', function(req, res){
   res.send(JSON.parse(fs.readFileSync('ips.json')));
});

//return config settings
app.get('/config', function(req, res){
    res.send(JSON.parse(fs.readFileSync('config.json')));
});

//listen for requests on port 8080
app.listen(PORT, function(err){if(err) console.log(err)});