// The command table, in the order `swjs --help` lists them.
import init from './init.mjs'
import check from './check.mjs'
import pack from './pack.mjs'
import publish from './publish.mjs'
import update from './update.mjs'
import preview from './preview.mjs'
import images from './images.mjs'
import status from './status.mjs'
import item from './item.mjs'
import list from './list.mjs'
import subscribed from './subscribed.mjs'
import doctor from './doctor.mjs'

export const commands = [init, check, pack, publish, update, preview, images, status, item, list, subscribed, doctor]
