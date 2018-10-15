// import
const express = require('express')
const bodyParser = require('body-parser')

// read port from environment variable
const port = process.env.PORT || 8000

// create express app and configure
const app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// attach router
app.use('/slack', require('./slack-api'))

// startup
app.listen(port, () => console.log(`app started at ${port}`))
