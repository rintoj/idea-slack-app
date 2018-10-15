const firebase = require('firebase')
const config = require('./config')

firebase.initializeApp(config.firebase)

// read a record from the path
async function read (path) {
  const snapshot = await firebase.database().ref(path).once('value')
  return { id: snapshot.key, ...snapshot.val() }
}

// read every children from a path
async function readList (path) {
  const snapshot = await firebase.database().ref(path).once('value')
  return snapshot.val()
}

// add a record to the path
async function add (path, data) {
  const ref = await firebase.database().ref(path).push(data)
  const snapshot = await ref.once('value')
  return { id: snapshot.key, ...snapshot.val() }
}

// update a record (partial update)
async function update (path, data) {
  await firebase.database().ref(path).update(data)
}

// remove a record
async function remove (path) {
  await firebase.database().ref(path).remove()
}

module.exports = {
  read,
  readList,
  add,
  update,
  remove
}
