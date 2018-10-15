const config = {
  firebase: {
    apiKey: '<<SET API KEY>>',
    authDomain: '<<SET AUTH DOMAIN>>',
    databaseURL: '<<SET DATABASE URL>>',
    projectId: '<<SET PROJECT ID>>',
    messagingSenderId: '<<SET MESSAGING SENDER ID>>'
  },
  slack: {
    apiUrl: 'https://slack.com/api',
    appId: '<<SET YOU SLACK APP ID HERE>>',
    client_id: '<<SET CLIENT ID>>',
    client_secret: '<<SET CLIENT SECRET>>'
  }
}

module.exports = config
