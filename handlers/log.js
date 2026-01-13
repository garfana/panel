const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const fetch = require('node-fetch')

/**
 * Log an action to a Discord webhook.
 * @param {string} action 
 * @param {string} message 
 */
module.exports = (action, message) => {
    if (!settings.logging.status) return
    if (!settings.logging.actions.user[action] && !settings.logging.actions.admin[action]) return

    fetch(settings.logging.webhook, {
        method: 'POST',
        headers: {
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            embeds: [
                {
                    color: hexToDecimal('#FFFFFF'),
                    title: `Event: \`${action}\``,
                    description: message,
                    author: {
                        name: 'Garfana Logging'
                    },
                    thumbnail: {
                        url: 'https:///' // This is the default Garfana logo, you can change it if you want.
                    }
                }
            ]
        })
    })
    .catch(() => {})
}

function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16)
}