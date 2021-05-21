const Discord = require('discord.js')
const WebSocket = require('ws');
const fs = require('fs')

const client = new Discord.Client()
client.login(fs.readFileSync('token.txt').toString())

const websockets_api = "wss://node.somenano.com/repeater"

/* Nano websockets */
function new_websocket(url, ready_callback, message_callback) {
    let socket = new WebSocket(url);
    socket.onopen = function () {
        if (ready_callback !== undefined) ready_callback(this);
    }
    socket.onerror = function (e) {
        console.error('WebSocket error');
        console.error(e);
    }
    socket.onmessage = function (response) {
        if (message_callback !== undefined) message_callback(response);
    }

    return socket;
}

function start_websockets(callback) {
    new_websocket(websockets_api, function (socket) {
        // onopen
        let params = {
            action: 'subscribe',
            topic: 'confirmation',
            options: {
                confirmation_type: "active_quorum",
            }
        }
        socket.send(JSON.stringify(params));
    }, function (response) {
        // onmessage
        let data = JSON.parse(response.data);
        if (data.topic != 'confirmation') return;
        handle_block_dump(data, callback);
    });
}

function handle_block_dump(data, callback) {
    let dtg, cps, blocks, duration = undefined;
    try {
        dtg = new Date(data.dtg);
        cps = data.cps;
        blocks = data.blocks;
        duration = data.duration;
    } catch (e) {
        console.error('In index.handle_block_dump: error parsing received WebSocket data.');
        console.error(data);
        console.error(e);
        return;
    }

    // Iterate over each block and "handle" spread over the given duration
    let spread = duration / blocks.length;
    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i];
        setTimeout(function () { callback(); }, spread * i);
    }

}

// 60 second CPS tracker
var cps_tracker = new Array(120).fill(0);
client.on('ready', () => {
    setInterval(update_cps, 1000);
})

function update_cps() {
    // Every second update the array
    cps_tracker = cps_tracker.slice(1);
    cps_tracker.push(0);
    show_cps();
}

let last_cps = -1
let last_activity = null
let last_status = null
let last_change = null

async function show_cps() {
    let now = Date.now()
    if(last_change == null || (now - last_change) >= 10000) {
        last_change = now
        let cur_cps = cps_tracker.slice(cps_tracker.length / 2).reduce(function (a, b) { return a + b; }, 0) / (cps_tracker.length / 2);
        let past_cps = cps_tracker.slice(0, cps_tracker.length / 2).reduce(function (a, b) { return a + b; }, 0) / (cps_tracker.length / 2);
        let guilds = client.guilds.cache
        if(cur_cps.toFixed(2) != last_cps.toFixed(2)) {
            last_cps = cur_cps
            guilds.forEach(guild => {
                try {
                    guild.me.setNickname('Nano CPS = ' + cur_cps.toFixed(2))
                } catch(e) {
                }
            })
        }
        let activity
        let status
        if(cur_cps == past_cps) {
            activity = '+0.00%'
            status = 'idle'
        } else if(past_cps == 0) {
            activity = '+∞%'
            status = 'online'
        } else if(cur_cps > past_cps) {
            activity = '+' + ((cur_cps - past_cps) / past_cps * 100).toFixed(2) + '%'
            status = 'online'
        } else if(cur_cps < past_cps) {
            activity = '-' + ((1 - cur_cps / past_cps) * 100).toFixed(2) + '%'
            status = 'dnd'
        }
        if(activity != last_activity) {
            last_activity = activity
            client.user.setActivity(activity, {'type': 'WATCHING'})
        }
        if(status != last_status) {
            last_status = status
            client.user.setStatus(status)
        }
    }
}

async function handle_new_block(data) {
    // Update CPS
    cps_tracker[cps_tracker.length - 1] += 1;
}

start_websockets(handle_new_block)