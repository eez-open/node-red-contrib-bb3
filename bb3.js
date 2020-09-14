const { stat } = require('fs');

module.exports = function (RED) {
    "use strict";

    var net = require('net');
    var events = require("events");

    const RECONNECT_TIMEOUT = 1000;
    const QUERY_TIMEOUT = 3000;

    const CONNECTION_STATE_DISCONNECTED = "disconnected";
    const CONNECTION_STATE_CONNECTING = "connecting";
    const CONNECTION_STATE_DISCONNECTING = "disconnecting";
    const CONNECTION_STATE_CONNECTED = "connected";
    const CONNECTION_STATE_EXECUTING_COMMAND = "executing command";
    const CONNECTION_STATE_EXECUTING_QUERY = "executing query";

    const EVENT_TYPE_CONNECT = "connect";
    const EVENT_TYPE_DISCONNECT = "disconnect";
    const EVENT_TYPE_EXECUTE_COMMAND = "execute command";
    const EVENT_TYPE_EXECUTE_QUERY = "execute query";

    const EVENT_TYPE_ON_SOCKET_CONNECTED = "on socket connected";
    const EVENT_TYPE_ON_SOCKET_DATA = "on socket data";
    const EVENT_TYPE_ON_SOCKET_END = "on socket end";
    const EVENT_TYPE_ON_SOCKET_CLOSE = "on socket close";
    const EVENT_TYPE_ON_SOCKET_ERROR = "on socket error";

    //
    // BB3 Connection config node
    //

    function ConnectionNode(n) {
        RED.nodes.createNode(this, n);
        this.name = n.name;
        this.host = n.host;
        this.port = n.port;
        this.autoConnect = n.autoConnect;

        let node = this;

        node.bb3ConnectionEventEmitter = new events.EventEmitter();

        let state = CONNECTION_STATE_DISCONNECTED;
        let stateCallback;
        let socket;
        let queryTimeout;
        let accData;
        let reconnectIntervalHandle;

        function setState(newState, newStateCallback) {
            RED.log.info(`[${node.name}] state transition '${state}' => '${newState}'`);
            node.bb3ConnectionEventEmitter.emit('state-change', {
                oldState: state,
                newState
            });
            state = newState;
            stateCallback = newStateCallback;
            accData = "";
        }

        function socketCleanup() {
            socket.unref();
            socket.removeAllListeners();
            socket = undefined;

            if (stateCallback) {
                stateCallback(null);
            }

            setState(CONNECTION_STATE_DISCONNECTED);
        }

        function setReconnect() {
            if (!reconnectIntervalHandle) {
                reconnectIntervalHandle = setInterval(function () {
                    if (state == CONNECTION_STATE_DISCONNECTED) {
                        stateTransition({
                            type: EVENT_TYPE_CONNECT
                        });
                    }
                }, RECONNECT_TIMEOUT);
            }
        }

        function clearReconnect() {
            if (reconnectIntervalHandle) {
                clearInterval(reconnectIntervalHandle);
                reconnectIntervalHandle = undefined;
            }
        }

        function stateTransition(event) {
            if (state == CONNECTION_STATE_DISCONNECTED) {
                if (event.type == EVENT_TYPE_CONNECT) {
                    setState(CONNECTION_STATE_CONNECTING);

                    socket = net.createConnection(node.port, node.host, function () {
                        RED.log.info(`[${node.name}] on socket connected`);
                        stateTransition({
                            type: EVENT_TYPE_ON_SOCKET_CONNECTED
                        });
                    });

                    socket.on('data', function (data) {
                        RED.log.info(`[${node.name}] on socket data '${data}'`);
                        stateTransition({
                            type: EVENT_TYPE_ON_SOCKET_DATA,
                            arg: data
                        });
                    });

                    socket.on('end', function () {
                        RED.log.info(`[${node.name}] on socket end`);
                        stateTransition({
                            type: EVENT_TYPE_ON_SOCKET_END
                        });
                    });

                    socket.on('close', function () {
                        RED.log.info(`[${node.name}] on socket close`);
                        stateTransition({
                            type: EVENT_TYPE_ON_SOCKET_CLOSE
                        });
                    });

                    socket.on('error', function (err) {
                        RED.log.info(`[${node.name}] on socket error '${err}'`);
                        stateTransition({
                            type: EVENT_TYPE_ON_SOCKET_ERROR,
                            arg: {
                                err
                            }
                        });
                    });

                    return;
                }

                if (event.type == EVENT_TYPE_DISCONNECT) {
                    // DO NOTHING
                    event.arg.callback(null);
                    return;
                }
            }

            if (state == CONNECTION_STATE_CONNECTING) {
                if (event.type == EVENT_TYPE_ON_SOCKET_CONNECTED) {
                    setState(CONNECTION_STATE_CONNECTED);
                    return;
                }

                if (event.type == EVENT_TYPE_DISCONNECT) {
                    setState(CONNECTION_STATE_DISCONNECTING);
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_CLOSE) {
                    setState(CONNECTION_STATE_DISCONNECTED);
                    return;
                }
            }

            if (state == CONNECTION_STATE_DISCONNECTING) {
                if (event.type == EVENT_TYPE_ON_SOCKET_CONNECTED) {
                    socket.destroy();
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_END) {
                    // DO NOTHING
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_CLOSE) {
                    // DO NOTHING
                    socketCleanup();
                    return;
                }
            }

            if (state == CONNECTION_STATE_CONNECTED) {
                if (event.type == EVENT_TYPE_CONNECT) {
                    // DO NOTHING
                    event.arg.callback(null);
                    return;
                }

                if (event.type == EVENT_TYPE_DISCONNECT) {
                    setState(CONNECTION_STATE_DISCONNECTING, event.arg.callback);
                    socket.destroy();
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_CLOSE) {
                    socketCleanup();
                    return;
                }

                if (event.type == EVENT_TYPE_EXECUTE_COMMAND) {
                    setState(CONNECTION_STATE_EXECUTING_COMMAND, event.arg.callback);
                    socket.write(event.arg.command + "\n", 'utf8', function () {
                        event.arg.callback(null);
                        setState(CONNECTION_STATE_CONNECTED);
                    });
                    return;
                }

                if (event.type == EVENT_TYPE_EXECUTE_QUERY) {
                    setState(CONNECTION_STATE_EXECUTING_QUERY, event.arg.callback);
                    socket.write(event.arg.query + "\n", 'utf8');
                    queryTimeout = setTimeout(function () {
                        RED.log.error(`[${node.name}] query timeout`);
                        event.arg.callback("timeout");
                        setState(CONNECTION_STATE_CONNECTED);
                    }, QUERY_TIMEOUT);
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_DATA) {
                    accData += event.arg.toString();

                    while (true) {
                        let i = accData.indexOf("\r\n");
                        if (i == -1) {
                            break;
                        }
                        let data = accData.substr(0, i);
                        if (data.startsWith("**ERROR")) {
                            RED.log.error(`[${node.name}] error: '${data}'`);
                        } else {
                            RED.log.warn(`[${node.name}] unexpected: '${data}'`);
                        }
                        accData = accData.substr(i + 2);
                    }

                    return;
                }
            }

            if (state == CONNECTION_STATE_EXECUTING_COMMAND) {
                if (event.type == EVENT_TYPE_DISCONNECT) {
                    stateCallback("interrupted");
                    setState(CONNECTION_STATE_DISCONNECTING, event.arg.callback);
                    socket.destroy();
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_CLOSE) {
                    stateCallback("interrupted");
                    socketCleanup();
                    return;
                }
            }

            if (state == CONNECTION_STATE_EXECUTING_QUERY) {
                if (event.type == EVENT_TYPE_ON_SOCKET_DATA) {
                    accData += event.arg.toString();

                    while (true) {
                        let i = accData.indexOf("\r\n");
                        if (i == -1) {
                            break;
                        }
                        let data = accData.substr(0, i);
                        if (data.startsWith("**ERROR")) {
                            RED.log.error(`[${node.name}] error: '${data}'`);
                            accData = accData.substr(i + 2);
                        } else {
                            RED.log.info(`[${node.name}] query result: "${data}"`);
                            let num = Number(data);
                            if (!isNaN(num)) {
                                stateCallback(null, num);
                            } else {
                                if (data.length >= 2 && data.startsWith("\"") && data.endsWith("\"")) {
                                    data = data.substr(1, data.length - 2);
                                }
                                stateCallback(null, data);
                            }
                            clearTimeout(queryTimeout);
                            setState(CONNECTION_STATE_CONNECTED);
                            break;
                        }
                    }

                    return;
                }

                if (event.type == EVENT_TYPE_DISCONNECT) {
                    clearTimeout(queryTimeout);
                    stateCallback("interrupted");
                    setState(CONNECTION_STATE_DISCONNECTING, event.arg.callback);
                    socket.destroy();
                    return;
                }

                if (event.type == EVENT_TYPE_ON_SOCKET_CLOSE) {
                    clearTimeout(queryTimeout);
                    stateCallback("interrupted");
                    socketCleanup();
                    return;
                }
            }

            RED.log.error(`[${node.name}] event '${event.type}' not handled in state '${state}'`);
            if (event.arg && event.arg.callback) {
                event.arg.callback("invalid state")
            }
        }

        /////

        node.bb3Connect = function (callback) {
            RED.log.info(`[${node.name}] connect()`);

            stateTransition({
                type: EVENT_TYPE_CONNECT,
                arg: {
                    callback
                }
            });

            setReconnect();
        };

        node.bb3Disconnect = function (callback) {
            RED.log.info(`[${node.name}] disconnect()`);

            stateTransition({
                type: EVENT_TYPE_DISCONNECT,
                arg: {
                    callback
                }
            });

            clearReconnect();
        };

        node.bb3ExecuteCommand = function (command, callback) {
            RED.log.info(`[${node.name}] execute command('${command}')`);

            stateTransition({
                type: EVENT_TYPE_EXECUTE_COMMAND,
                arg: {
                    command,
                    callback
                }
            });
        };

        node.bb3ExecuteQuery = function (query, callback) {
            RED.log.info(`[${node.name}] execute query('${query}')`);

            stateTransition({
                type: EVENT_TYPE_EXECUTE_QUERY,
                arg: {
                    query,
                    callback
                }
            });
        };

        node.bb3EmitState = function() {
            node.bb3ConnectionEventEmitter.emit('state-change', {
                newState: ""
            });

            setTimeout(function () {
                node.bb3ConnectionEventEmitter.emit('state-change', {
                    newState: state
                });
            }, 10)
        }

        /////

        node.on("close", function (done) {
            RED.log.info(`[${node.name}] on connection node close`);
            stateTransition({
                type: EVENT_TYPE_DISCONNECT,
                arg: {
                    callback: done
                }
            });
            clearReconnect();
        });

        /////

        if (node.autoConnect) {
            stateTransition({
                type: EVENT_TYPE_CONNECT
            });
            setReconnect();
        }
    }
    RED.nodes.registerType("bb3-connection", ConnectionNode);

    //

    function makeCallback(msg, send, done) {
        return function (err, result) {
            if (err) {
                if (done) {
                    done(err);
                } else {
                    node.error(err, msg);
                }
            } else {
                send = send || function() { node.send.apply(node,arguments) }

                msg.payload = result;
                send(msg);

                if (done) {
                    done();
                }
            }
        }
    }

    //
    // BB3 Connect node
    //

    function ConnectNode(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        node.connection = RED.nodes.getNode(config.connection);

        node.on("input", function (msg, send, done) {
            node.connection.bb3Connect(makeCallback(msg, send, done));
        });

        function onConnectionStateChange(arg) {
            node.status({
                fill: arg.newState == CONNECTION_STATE_CONNECTED ? "green" : arg.newState != CONNECTION_STATE_DISCONNECTED ? "blue" : "red",
                shape: "ring",
                text: arg.newState
            });
        }

        node.connection.bb3ConnectionEventEmitter.on('state-change', onConnectionStateChange);
        node.connection.bb3EmitState();

        node.on("close", function (done) {
            node.connection.bb3ConnectionEventEmitter.off('state-change', onConnectionStateChange);
            done();
        });
    }
    RED.nodes.registerType("bb3-connect", ConnectNode);

    //
    // BB3 Disconnect node
    //

    function DisconnectNode(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        node.connection = RED.nodes.getNode(config.connection);

        node.on("input", function (msg, send, done) {
            node.connection.bb3Disconnect(makeCallback(msg, send, done));
        });
    }
    RED.nodes.registerType("bb3-disconnect", DisconnectNode);

    //
    // BB3 Command node
    //

    function CommandNode(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        node.connection = RED.nodes.getNode(config.connection);
        node.command = config.command;

        node.on("input", function (msg, send, done) {
            node.connection.bb3ExecuteCommand(node.command, makeCallback(msg, send, done));
        });
    }

    RED.nodes.registerType("bb3-command", CommandNode);

    //
    // BB3 Query node
    //

    function QueryNode(config) {
        RED.nodes.createNode(this, config);

        var node = this;

        node.connection = RED.nodes.getNode(config.connection);
        node.query = config.query;

        node.on("input", function (msg, send, done) {
            node.connection.bb3ExecuteQuery(node.query, makeCallback(msg, send, done));
        });
    }
    RED.nodes.registerType("bb3-query", QueryNode);

    //
    // BB3 on-event
    //

    const bb3EventEmitter = new events.EventEmitter();
    bb3EventEmitter.setMaxListeners(1000);

    function OnEventNode(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        var handler = function (msg) {
            node.send(msg);
        }

        var eventName;

        this.on("input", function (msg) {
            eventName = msg.eventName;
            if (eventName) {
                bb3EventEmitter.on(eventName, handler);
            }
        });

        this.on("close",function() {
            if (eventName) {
                bb3EventEmitter.removeListener(eventName, handler);
            }
        });
    }
    RED.nodes.registerType("bb3-on-event", OnEventNode);

    //
    // BB3 emit-event
    //

    function EmitEventNode(n) {
        RED.nodes.createNode(this,n);

        this.on("input", function (msg) {
            if (msg.eventName) {
                bb3EventEmitter.emit(msg.eventName, msg)
            }
        });
    }
    RED.nodes.registerType("bb3-emit-event", EmitEventNode);
};
