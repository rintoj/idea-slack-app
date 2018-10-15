const router = require('express').Router()
const fetch = require('node-fetch')
const config = require('./config')
const firebase = require('./firebase')
const linkPreview = require('@nunkisoftware/link-preview')

/**
 * Send a slack message
 */
async function slack (responseURL, json, token) {
  const postOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${token}`
    },
    body: json && JSON.stringify(json)
  }
  await fetch(responseURL, postOptions)
}

/**
 * Send an idea to a Slack channel
 */
async function shareIdea (idea, { channel_id, team_id, user_id, user_name, response_url }) {
  const liked = idea.likes && idea.likes[user_id]

  const message = {
    text: `@${user_name} shared`,
    channel: channel_id,
    attachments: [{
      callback_id: '/idea_action',
      color: '#36a64f',
      pretext: idea.idea,
      author_name: `@${idea.user} shared`,
      actions: [{
        name: 'like',
        type: 'button',
        text: liked ? `${Object.keys(idea.likes || {}).length} Likes` : 'Like',
        value: JSON.stringify({ id: idea.id, team_id }),
        style: liked ? '' : 'primary'
      }]
    }]
  }

  const slackTeam = await firebase.read(`/slack/${team_id}`)
  const requestUrl = response_url || `${config.slack.apiUrl}/chat.postMessage`
  await slack(requestUrl, message, slackTeam.token)
}

/**
 * Process oAuth request. Adds an entry to the database with the team id, access token
 */
router.get('/oauth', async (request, response) => {
  try {
    // obtain temporary code from request url
    const code = request.query.code
    if (code === null || code === '') { throw new Error('Invalid code') }

    // use this code to obtain access code
    const { client_id, client_secret } = config.slack
    const tokenResponse = await fetch(`${config.slack.apiUrl}/oauth.access`, {
      method: 'POST',
      headers: { 'Content-type': 'application/x-www-form-urlencoded' },
      body: `client_id=${client_id}&client_secret=${client_secret}&code=${code}`
    })

    // validate response
    const authResponse = await tokenResponse.json()
    if (authResponse.ok !== true) {
      throw new Error(`Operation failed with an error: ${authResponse.error}`)
    }

    // save access token in firebase
    const { access_token, team_id, team_name, user_id } = authResponse
    await firebase.update(`/slack/${team_id}`, { token: access_token, user_id, team_id, team_name })

    // redirect user to application home
    return response.redirect(`https://slack.com/apps/${config.slack.appId}`)
  } catch (e) {
    console.error(e)
    response.status(500).send(`ERROR: ${e.message}`)
  }
})

/**
 * Open a dialog when '/share' command is received
 */
router.post('/', async (request, response, next) => {
  try {
    // validate request
    if (request.body.command !== '/share') { return next() }
    if (request.method !== 'POST') { throw new Error('Unsupported method!') }

    const { text, team_id, trigger_id } = request.body

    // construct dialog message
    const message = {
      callback_id: '/submit_idea',
      title: 'Share an idea',
      submit_label: 'Share',
      notify_on_cancel: true,
      elements: [{
        type: 'textarea',
        label: 'Idea',
        name: 'idea',
        value: text,
        placeholder: 'Describe your idea here'
      }, {
        label: 'Article / Image URL',
        name: 'articleURL',
        type: 'text',
        optional: true,
        placeholder: 'https://xyz.com/abc'
      }]
    }

    // read access token from database
    const team = await firebase.read(`/slack/${team_id}`)
    if (team == null) {
      throw new Error(`This workspace is not authorized. Goto https://slack.com/apps/${config.slack.appId} to install the app`)
    }

    // show dialog using /dialog.open API
    const requestUrl = `${config.slack.apiUrl}/dialog.open?token=${team.token}&trigger_id=${trigger_id}&dialog=${JSON.stringify(message)}`
    await slack(requestUrl)

    // send a response back to the caller; this is important
    response.send('')
  } catch (e) {
    console.error(e)
    response.status(500).send(`ERROR: ${e.message}`)
  }
})

/**
 * Process the request to share the idea (invoked when 'Share' button of the dialog is clicked)
 */
router.post('/', async (request, response, next) => {
  // validate input
  if (request.body.payload === undefined) { return next() }
  const payload = JSON.parse(request.body.payload)
  if (payload.callback_id !== '/submit_idea') { return next() }
  if (request.method !== 'POST') { throw new Error('Unsupported method!') }

  // send OK back to slack; this is important;
  response.send('')

  const { submission, channel, team, user } = payload

  // submission contains the user input (form values)
  if (submission == null) { throw new Error('Invalid request, missing submission.') }

  // fetch meta information using "og" tags for the given URL
  let meta = {}
  if (submission.articleURL != null) {
    const { title, description, image, siteName } = await linkPreview(submission.articleURL)
    if (title != null) { meta.title = title }
    if (description != null) { meta.description = description }
    if (image != null) { meta.image = image }
    if (image == null) { meta.image = submission.articleURL }
    if (siteName != null) { meta.siteName = siteName }
  }

  // create idea object to be saved in database
  const idea = {
    ...submission,
    meta,
    createTs: Date.now(),
    user: user.name,
    uid: user.id
  }

  // fetch slack team from database
  const slackTeam = await firebase.read(`/slack/${team.id}`)
  if (slackTeam == null) {
    throw new Error(`This workspace is not authorized. Goto https://slack.com/apps/${config.slack.appId} to install the app`)
  }

  // save idea to database
  const record = await firebase.add(`/ideas/${team.id}`, idea)

  // send idea to slack
  shareIdea(record, { channel_id: channel.id, team_id: team.id, user_id: user.id, user_name: user.name })
})

/**
 * Handle "like" action
 */
router.post('/', async (request, response, next) => {
  // validate input
  if (request.body.payload === undefined) { return next() }

  const { callback_id, actions, team, user, channel, response_url } = JSON.parse(request.body.payload)

  // do not proceed if this not an idea action
  if (callback_id !== '/idea_action') { return next() }

  // process "like" action only
  if (actions[0].name !== 'like') { return next() }

  // send OK back to slack; this is important;
  response.send('')

  // update firebase
  const { team_id, id } = JSON.parse(actions[0].value)
  await firebase.update(`/ideas/${team_id}/${id}/likes`, { [user.id]: true })

  const ideaFromDB = await firebase.read(`/ideas/${team_id}/${id}`)

  // send idea to slack
  shareIdea(ideaFromDB, { channel_id: channel.id, team_id: team.id, user_id: user.id, user_name: user.name, response_url })
})

module.exports = router
