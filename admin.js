/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var express =  require('express');
var socketio = require('socket.io');
var request =  require('request');
var fs =       require('fs');
var Stream =   require('stream');
var utils =    require(__dirname + '/lib/utils'); // Get common adapter utils

var session;
var cookieParser;
var bodyParser;
var AdapterStore;
var passportSocketIo;
var password;
var passport;
var LocalStrategy;
var flash;

var webServer =   null;
var store =       null;
var objects =     {};
var states =      {};
var secret =      'Zgfr56gFe87jJOM'; // Will be generated by first start
var userKey =     'connect.sid';
var cmdSessions = {};

var adapter = utils.adapter({
    name:          'admin',    // adapter name
    dirname:        __dirname, // say own position
    logTransporter: true,      // receive the logs
    install: function (callback) {
        if (typeof callback === 'function') callback();
    }
});

adapter.on('objectChange', function (id, obj) {
    if (obj) {
        //console.log('objectChange: ' + id);
        objects[id] = obj;
    } else {
        //console.log('objectDeleted: ' + id);
        if (objects[id]) delete objects[id];
    }
    // TODO Build in some threshold of messages

    if (webServer && webServer.io) {
        var clients = webServer.io.sockets.connected;

        for (var i in clients) {
            updateSession(clients[i]);
        }
        webServer.io.sockets.emit('objectChange', id, obj);
    }
});

adapter.on('stateChange', function (id, state) {
    if (!state) {
        if (states[id]) delete states[id];
    } else {
        states[id] = state;
    }
    if (webServer && webServer.io) {
        var clients = webServer.io.sockets.connected;

        for (var i in clients) {
            updateSession(clients[i]);
        }
        webServer.io.sockets.emit('stateChange', id, state);
    }
});

adapter.on('ready', function () {
    adapter.getForeignObject("system.adapter.admin", function (err, obj) {
        if (!err && obj) {
            if (!obj.native.secret) {
                require('crypto').randomBytes(24, function (ex, buf) {
                    secret = buf.toString('hex');
                    adapter.extendForeignObject("system.adapter.admin", {native: {secret: secret}});
                    main();
                });
            } else {
                secret = obj.native.secret;
                main();
            }
        } else {
            adapter.logger.error("Cannot find object system.adapter.admin");
        }
    });
});

adapter.on('message', function (obj) {
    if (!obj || !obj.message)
        return false;

    if (cmdSessions[obj.message.id]) {
        if (webServer) webServer.io.sockets.emit(obj.command, obj.message.id, obj.message.data);
        // we cannot save the socket, because if it takes a bit time, the socket will be invalid
        //cmdSessions[obj.message.id].socket.emit(obj.command, obj.message.id, obj.message.data);
        if (obj.command == 'cmdExit') {
            delete cmdSessions[obj.message.id];
        }
    }

    return true;
});

adapter.on('unload', function (callback) {
    if (adapter.requireLog) adapter.requireLog(false);

    try {
        adapter.log.info("terminating http" + (webServer.settings.secure ? "s" : "") + " server on port " + webServer.settings.port);
        webServer.server.close();

        callback();
    } catch (e) {
        callback();
    }
});

adapter.on('log', function (obj) {
    // obj = {message: msg, severity: level, from: this.namespace, ts: (new Date()).getTime()}
    if (webServer && webServer.io && webServer.io.sockets) {
        // TODO Build in some threshold
        webServer.io.sockets.emit('log', obj);
    }
});

function main() {
    adapter.subscribeForeignStates('*');
    adapter.subscribeForeignObjects('*');

    var options = null;

    if (adapter.config.secure) {
        // Load certificates
        adapter.getForeignObject('system.certificates', function (err, obj) {
            if (err || !obj ||
                !obj.native.certificates ||
                !adapter.config.certPublic ||
                !adapter.config.certPrivate ||
                !obj.native.certificates[adapter.config.certPublic] ||
                !obj.native.certificates[adapter.config.certPrivate]
                ) {
                adapter.log.error('Cannot enable secure web server, because no certificates found: ' + adapter.config.certPublic + ', ' + adapter.config.certPrivate);
            } else {
                adapter.config.certificates = {
                    key:  obj.native.certificates[adapter.config.certPrivate],
                    cert: obj.native.certificates[adapter.config.certPublic]
                };

            }
            webServer = initWebServer(adapter.config);
            getData();
        });
    } else {
        webServer = initWebServer(adapter.config);
        getData();
    }
}

function addUser(user, pw, callback) {
    adapter.getForeignObject("system.user." + user, function (err, obj) {
        if (obj) {
            if (callback) callback("User yet exists");
        } else {
            adapter.setForeignObject('system.user.' + user, {
                type: 'user',
                common: {
                    name:    user,
                    enabled: true,
                    groups:  []
                }
            }, function () {
                adapter.setPassword(user, pw, callback);
            });
        }
    });
}

function delUser(user, callback) {
    adapter.getForeignObject("system.user." + user, function (err, obj) {
        if (err || !obj) {
            if (callback) callback("User does not exist");
        } else {
            if (obj.common.dontDelete) {
                if (callback) callback("Cannot delete user, while is system user");
            } else {
                adapter.delForeignObject("system.user." + user, function (err) {
                    // Remove this user from all groups in web client
                    if (callback) callback(err);
                });
            }
        }
    });
}

function addGroup(group, desc, acl, callback) {
    var name = group;
    if (typeof acl == 'function') {
        callback = acl;
        acl = null;
    }
    if (typeof desc == 'function') {
        callback = desc;
        desc = null;
    }
    if (name && name.substring(0, 1) != name.substring(0, 1).toUpperCase()) {
        name = name.substring(0, 1).toUpperCase() + name.substring(1);
    }
    group = group.substring(0, 1).toLowerCase() + group.substring(1);

    adapter.getForeignObject("system.group." + group, function (err, obj) {
        if (obj) {
            if (callback) callback("Group yet exists");
        } else {
            adapter.setForeignObject('system.group.' + group, {
                type: 'group',
                common: {
                    name:    name,
                    desc:    desc,
                    members: [],
                    acl:     acl
                }
            }, function (err, obj) {
                if (callback) callback(err, obj);
            });
        }
    });
}

function delGroup(group, callback) {
    adapter.getForeignObject("system.group." + group, function (err, obj) {
        if (err || !obj) {
            if (callback) callback("Group does not exist");
        } else {
            if (obj.common.dontDelete) {
                if (callback) callback("Cannot delete group, while is system group");
            } else {
                adapter.delForeignObject("system.group." + group, function (err) {
                    // Remove this group from all users in web client
                    if (callback) callback(err);
                });
            }
        }
    });
}

//settings: {
//    "port":   8080,
//    "auth":   false,
//    "secure": false,
//    "bind":   "0.0.0.0", // "::"
//    "cache":  false
//}
function initWebServer(settings) {

    var server = {
        app:       null,
        server:    null,
        io:        null,
        settings:  settings
    };

    if (settings.port) {
        server.app = express();
        if (settings.auth) {
            session =           require('express-session');
            cookieParser =      require('cookie-parser');
            bodyParser =        require('body-parser');
            AdapterStore =      require(utils.controllerDir + '/lib/session.js')(session);
            passportSocketIo =  require(__dirname + '/lib/passport.socketio.js');
            password =          require(utils.controllerDir + '/lib/password.js');
            passport =          require('passport');
            LocalStrategy =     require('passport-local').Strategy;
            flash =             require('connect-flash'); // TODO report error to user

            store = new AdapterStore({adapter: adapter});

            passport.use(new LocalStrategy(
                function (username, password, done) {

                    adapter.checkPassword(username, password, function (res) {
                        if (res) {
                            return done(null, username);
                        } else {
                            return done(null, false);
                        }
                    });

                }
            ));
            passport.serializeUser(function (user, done) {
                done(null, user);
            });

            passport.deserializeUser(function (user, done) {
                done(null, user);
            });

            server.app.use(cookieParser());
            server.app.use(bodyParser.urlencoded({
                extended: true
            }));
            server.app.use(bodyParser.json());
            server.app.use(session({
                secret: secret,
                saveUninitialized: true,
                resave: true,
                store:  store
            }));
            server.app.use(passport.initialize());
            server.app.use(passport.session());
            server.app.use(flash());

            server.app.post('/login', function (req, res) {
                var redirect = '/';
                if (req.body.origin) {
                    var parts = req.body.origin.split('=');
                    if (parts[1]) redirect = decodeURIComponent(parts[1]);
                }
                var authenticate = passport.authenticate('local', {
                    successRedirect: redirect,
                    failureRedirect: '/login/index.html' + req.body.origin + (req.body.origin ? '&error' : '?error'),
                    failureFlash: 'Invalid username or password.'
                })(req, res);
            });

            server.app.get('/logout', function (req, res) {
                req.logout();
                res.redirect('/login/index.html');
            });

            // route middleware to make sure a user is logged in
            server.app.use(function (req, res, next) {
                if (req.isAuthenticated() ||
                    /^\/login\//.test(req.originalUrl) ||
                    /\.ico$/.test(req.originalUrl)
                ) return next();
                res.redirect('/login/index.html?href=' + encodeURIComponent(req.originalUrl));
            });
        } else {
            server.app.get('/login', function (req, res) {
                res.redirect('/');
            });
            server.app.get('/logout', function (req, res) {
                res.redirect('/');
            });
        }

        var appOptions = {};
        if (settings.cache) {
            appOptions.maxAge = 30758400000;
        }

        server.app.use('/', express.static(__dirname + '/www', appOptions));

        // reverse proxy with url rewrite for couchdb attachments in <adapter-name>.admin
        server.app.use('/adapter/', function (req, res) {

            // Example: /example/?0
            var url = req.url;

            // add index.html
            url = url.replace(/\/($|\?|#)/, '/index.html$1');

            // Read config files for admin from /adapters/admin/admin/...
            if (url.substring(0, '/admin/'.length) == '/admin/') {
                url = url.replace(/\/admin\//, __dirname + '/admin/');
                url = url.replace(/\?[0-9]*/, '');

                try {
                    fs.createReadStream(url).pipe(res);
                } catch (e) {
                    var s = new Stream();
                    s.pipe = function (dest) {
                        dest.write('File not found: ' + e);
                    };

                    s.pipe(res);
                }
                return;
            }
            url = url.split('/');
            // Skip first /
            url.shift();
            // Get ID
            var id = url.shift() + '.admin';
            url = url.join('/');
            var pos = url.indexOf('?');
            if (pos != -1) {
                url = url.substring(0, pos);
            }
            adapter.readFile(id, url, null, function (err, buffer, mimeType) {
                if (!buffer || err) {
                    res.contentType('text/html');
                    res.status(404).send('File ' + url + ' not found');
                } else {
                    if (mimeType) {
                        res.contentType(mimeType['content-type'] || mimeType);
                    } else {
                        res.contentType('text/javascript');
                    }
                    res.send(buffer);
                }
            });
        });

        if (settings.secure) {
            server.server = require('https').createServer(adapter.config.certificates, server.app);
        } else {
            server.server = require('http').createServer(server.app);
        }
        server.server.__server = server;
    } else {
        adapter.log.error('port missing');
        process.exit(1);
    }

    if (server.server) {
        adapter.getPort(settings.port, function (port) {
            if (port != settings.port && !adapter.config.findNextPort) {
                adapter.log.error('port ' + settings.port + ' already in use');
                process.exit(1);
            }
            server.server.listen(port);
            adapter.log.info('http' + (settings.secure ? 's' : '') + ' server listening on port ' + port);
            adapter.log.info('Use link "http' + (settings.secure ? 's' : '') + '://localhost:' + port + '" to configure.');

            server.io = socketio.listen(server.server, (settings.bind && settings.bind != "0.0.0.0") ? settings.bind : undefined);

            if (settings.auth) {
                server.io.use(passportSocketIo.authorize({
                    passport:     passport,
                    cookieParser: cookieParser,
                    key:          userKey,             // the name of the cookie where express/connect stores its session_id
                    secret:       secret,              // the session_secret to parse the cookie
                    store:        store,               // we NEED to use a sessionstore. no memorystore please
                    success:      onAuthorizeSuccess,  // *optional* callback on success - read more below
                    fail:         onAuthorizeFail      // *optional* callback on fail/error - read more below
                }));
            }

            /*server.io.set('logger', {
             debug: function(obj) {adapter.log.debug("socket.io: " + obj)},
             info:  function(obj) {adapter.log.debug("socket.io: " + obj)} ,
             error: function(obj) {adapter.log.error("socket.io: " + obj)},
             warn:  function(obj) {adapter.log.warn("socket.io: " + obj)}
             });*/
            server.io.on('connection', initSocket);
        });
    }

    if (server.server) {
        return server;
    } else {
        return null;
    }
}

function getData() {
    adapter.log.info('requesting all states');
    adapter.getForeignStates('*', function (err, res) {
        adapter.log.info('received all states');
        states = res;
    });
    adapter.log.info('requesting all objects');
    adapter.objects.getObjectList({include_docs: true}, function (err, res) {
        adapter.log.info('received all objects');
        res = res.rows;
        objects = {};
        for (var i = 0; i < res.length; i++) {
            objects[res[i].doc._id] = res[i].doc;
        }
    });
}

// Extract user name from socket
function getUserFromSocket(socket, callback) {
    var wait = false;
    try {
        if (socket.conn.request.sessionID) {
            wait = true;
            store.get(socket.conn.request.sessionID, function (err, obj) {
                if (obj && obj.passport && obj.passport.user) {
                    if (callback) callback(null, obj.passport.user);
                    return;
                }
            });
        }
    } catch (e) {

    }
    if (!wait && callback) callback("Cannot detect user");
}

function initSocket(socket) {
    if (adapter.config.auth) {
		adapter.config.ttl = adapter.config.ttl || 3600;
        getUserFromSocket(socket, function (err, user) {
            if (err || !user) {
                adapter.log.error('socket.io ' + err);
                return;
            } else {
                adapter.log.debug('socket.io client ' + user + ' connected');
                adapter.calculatePermissions(user, commandsPermissions, function (acl) {
                    socket._acl = acl;
                    socketEvents(socket, user);
                });
            }
        });
    } else {
        adapter.calculatePermissions(adapter.config.defaultUser || 'admin', commandsPermissions, function (acl) {
            socket._acl = acl;
            socketEvents(socket, adapter.config.defaultUser || 'admin');
        });
    }
}

// upadate session ID, but not offter than 60 seconds
function updateSession(socket) {
    if (socket._sessionID) {
        var time = (new Date()).getTime();
        if (socket._lastActivity && time - socket._lastActivity > adapter.config.ttl * 1000) {
            socket.emit('reauthenticate');
            return false;
        }
        socket._lastActivity = time;
        if (!socket._sessionTimer) {
            socket._sessionTimer = setTimeout(function () {
                socket._sessionTimer = null;
                adapter.getSession(socket._sessionID, function (obj) {
                    if (obj) {
                        adapter.setSession(socket._sessionID, adapter.config.ttl, obj);
                    } else {
                        socket.emit('reauthenticate');
                    }
                });
            }, 60000);
        }
    }
    return true;
}

function checkPermissions(socket, command, callback, arg) {
    if (socket._user != 'admin') {
        // type: file, object, state, other
        // operation: create, read, write, list, delete, sendto, execute, sendto
        if (commandsPermissions[command]) {
            // If permission required
            if (commandsPermissions[command].type) {
                if (socket._acl[commandsPermissions[command].type] && socket._acl[commandsPermissions[command].type][commandsPermissions[command].operation]) {
                    return true;
                }
            } else {
                return true;
            }
        }

        console.log('No permission for "' + socket._user + '" to call ' + command);
        if (callback) {
            callback('permissionError');
        } else {
            socket.emit('permissionError', {
                command:    command,
                type:       commandsPermissions[command].type,
                operation:  commandsPermissions[command].operation,
                arg:        arg
            });
        }
        return false;
    } else {
        return true;
    }
}

// static information
var commandsPermissions = {
    getObject:          {type: 'object',    operation: 'read'},
    getObjects:         {type: 'object',    operation: 'list'},
    getObjectView:      {type: 'object',    operation: 'list'},
    setObject:          {type: 'object',    operation: 'write'},
    delObject:          {type: 'object',    operation: 'delete'},
    extendObject:       {type: 'object',    operation: 'write'},
    getHostByIp:        {type: 'object',    operation: 'list'},

    getStates:          {type: 'state',     operation: 'list'},
    getState:           {type: 'state',     operation: 'read'},
    setState:           {type: 'state',     operation: 'write'},
    delState:           {type: 'state',     operation: 'delete'},
    getStateHistory:    {type: 'state',     operation: 'read'},
    createState:        {type: 'state',     operation: 'create'},

    addUser:            {type: 'user',      operation: 'create'},
    delUser:            {type: 'user',      operation: 'delete'},
    addGroup:           {type: 'user',      operation: 'create'},
    delGroup:           {type: 'user',      operation: 'delete'},
    changePassword:     {type: 'user',      operation: 'write'},

    httpGet:            {type: 'other',     operation: 'http'},
    cmdExec:            {type: 'other',     operation: 'execute'},
    sendTo:             {type: 'other',     operation: 'sendto'},
    sendToHost:         {type: 'other',     operation: 'sendto'},

    readDir:            {type: 'file',      operation: 'list'},
    createFile:         {type: 'file',      operation: 'create'},
    writeFile:          {type: 'file',      operation: 'write'},
    readFile:           {type: 'file',      operation: 'read'},
    deleteFile:         {type: 'file',      operation: 'delete'},

    authEnabled:        {type: '',          operation: ''},
    disconnect:         {type: '',          operation: ''},
    listPermissions:    {type: '',          operation: ''},
    getUserPermissions: {type: 'object',    operation: 'read'}
};

function socketEvents(socket, user) {

    socket._user = user;

    if (socket.conn.request.sessionID) {
        socket._secure    = true;
        socket._sessionID = socket.conn.request.sessionID;
        // Get user for session
        adapter.getSession(socket.conn.request.sessionID, function (obj) {
            if (!obj || !obj.passport) {
                socket._user = '';
                socket.emit('reauthenticate');
            }
        });
    }

    // Enable logging, while some browser is connected
    if (adapter.requireLog) adapter.requireLog(true);

    /*
     *      objects
     */
    socket.on('getObject', function (id, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getObject', callback, id)) {
            adapter.getForeignObject(id, callback);
        }
    });

    socket.on('getObjects', function (callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getObjects', callback)) {
            callback(null, objects);
        }
    });

    socket.on('getObjectView', function (design, search, params, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getObjectView', callback, search)) {
            adapter.objects.getObjectView(design, search, params, callback);
        }
    });

    socket.on('setObject', function (id, obj, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'setObject', callback, id)) {
            adapter.setForeignObject(id, obj, callback);
        }
    });

    socket.on('delObject', function (id, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'delObject', callback, id)) {
            adapter.delForeignObject(id, callback);
        }
    });

    socket.on('extendObject', function (id, obj, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'extendObject', callback, id)) {
            adapter.extendForeignObject(id, obj, callback);
        }
    });

    socket.on('getHostByIp', function (ip, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getHostByIp', ip)) {
            adapter.objects.getObjectView('system', 'host', {}, function (err, data) {
                if (data.rows.length) {
                    for (var i = 0; i < data.rows.length; i++) {
                        if (data.rows[i].value.common.hostname == ip) {
                            if (callback) callback(ip, data.rows[i].value);
                            return;
                        }
                        if (data.rows[i].value.native.hardware && data.rows[i].value.native.hardware.networkInterfaces) {
                            var net = data.rows[i].value.native.hardware.networkInterfaces;
                            for (var eth in net) {
                                for (var j = 0; j < net[eth].length; j++) {
                                    if (net[eth][j].address == ip) {
                                        if (callback) callback(ip, data.rows[i].value);
                                        return;
                                    }
                                }
                            }
                        }
                    }
                }

                if (callback) callback(ip, null);
            });
        }
    });

    /*
     *      states
     */
    socket.on('getStates', function (callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getStates', callback)) {
            callback(null, states);
        }
    });

    socket.on('getState', function (id, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getState', callback, id)) {
            if (callback) callback(null, states[id]);
        }
    });

    socket.on('setState', function (id, state, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'setState', callback, id)) {
            if (typeof state !== 'object') state = {val: state};
            adapter.setForeignState(id, state, function (err, res) {
                if (typeof callback === 'function') callback(err, res);
            });
        }
    });

    socket.on('delState', function (id, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'delState', callback, id)) {
            adapter.delForeignState(id, callback);
        }
    });

    /*
     *      History
     */
    socket.on('getStateHistory', function (id, start, end, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getStateHistory', callback)) {
            adapter.getForeignStateHistory(id, start, end, callback);
        }
    });
    /*
     *      user/group
     */
    socket.on('addUser', function (user, pass, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'addUser', callback, user)) {
            addUser(user, pass, callback);
        }
    });

    socket.on('delUser', function (user, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'delUser', callback, user)) {
            delUser(user, callback);
        }
    });

    socket.on('addGroup', function (group, desc, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'addGroup', callback, group)) {
            addGroup(group, desc, callback);
        }
    });

    socket.on('delGroup', function (group, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'delGroup', callback, group)) {
            delGroup(group, callback);
        }
    });

    socket.on('changePassword', function (user, pass, callback) {
        if (updateSession(socket)) {
            if (user == socket._user || checkPermissions(socket, 'changePassword', callback, user)) {
                adapter.setPassword(user, pass, callback);
            }
        }
    });

    // HTTP
    socket.on('httpGet', function (url, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'httpGet', callback, url)) {
            request(url, callback);
        }
    });

    // iobroker commands will be executed on host/controller
    // following response commands are expected: cmdStdout, cmdStderr, cmdExit
    socket.on('cmdExec', function (host, id, cmd, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'cmdExec', callback, cmd)) {
            console.log('cmdExec on ' + host + '(' + id + '): ' + cmd);
            // remember socket for this ID.
            cmdSessions[id] = {socket: socket};
            adapter.sendToHost(host, 'cmdExec', {data: cmd, id: id});
        }
    });

    socket.on('readDir', function (_adapter, path, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'readDir', callback, path)) {
            adapter.readDir(_adapter, path, callback);
        }
    });

    socket.on('writeFile', function (_adapter, filename, data, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'writeFile', callback, filename)) {
            adapter.writeFile(_adapter, filename, data, null, callback);
        }
    });

    socket.on('readFile', function (_adapter, filename, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'readFile', callback, filename)) {
            adapter.readFile(_adapter, filename, null, callback);
        }
    });

    socket.on('sendTo', function (adapterInstance, command, message, callback) {
        if (updateSession(socket) && checkPermissions(socket, 'sendTo', callback, command)) {
            adapter.sendTo(adapterInstance, command, message, function (res) {
                if (callback) {
                    setTimeout(function () {
                        callback(res);
                    }, 0);
                }
            });
        }
    });

    socket.on('sendToHost', function (host, command, message, callback) {
        // host can answer following commands
        if (updateSession(socket)) {
            if ( (command != 'cmdExec' && command != 'delLogs'  && checkPermissions(socket, 'sendToHost', callback, command)) ||
                ((command == 'cmdExec' || command == 'delLogs') && checkPermissions(socket, 'cmdExec',    callback, command))) {
                adapter.sendToHost(host, command, message, function (res) {
                    if (callback) {
                        setTimeout(function () {
                            callback(res);
                        }, 0);
                    }
                });
            }
        }
    });

    socket.on('authEnabled', function (callback) {
        if (callback) callback(adapter.config.auth, socket._user);
    });

    socket.on('disconnect', function () {
        // Disable logging if no one browser is connected
        if (adapter.requireLog) adapter.requireLog(!!webServer.io.sockets.sockets.length);
    });

    socket.on('listPermissions', function (callback) {
        if (updateSession(socket)) {
            if (callback) callback(commandsPermissions);
        }
    });

    socket.on('getUserPermissions', function (callback) {
        if (updateSession(socket) && checkPermissions(socket, 'getUserPermissions', callback)) {
            if (callback) callback(null, socket._acl);
        }
    });
}

function onAuthorizeSuccess(data, accept) {
    adapter.log.info('successful connection to socket.io from ' + data.connection.remoteAddress);
    //adapter.log.info(JSON.stringify(data));

    accept();
}

function onAuthorizeFail(data, message, error, accept) {
    if (error) adapter.log.error('failed connection to socket.io from ' + data.connection.remoteAddress + ':', message);

    if (error) {
        accept(new Error(message));
    } else {
        accept('failed connection to socket.io: ' + message);//null, false);
    }
    // this error will be sent to the user as a special error-package
    // see: http://socket.io/docs/client-api/#socket > error-object
}
