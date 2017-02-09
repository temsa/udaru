'use strict'

const jsonfile = require('jsonfile')
const spawn = require('child_process').spawn
const path = require('path')
const source = path.join(__dirname, 'fixtures/injection-endpoints.json')
const async = require('async')
const chalk = require('chalk')

const endpoints = jsonfile.readFileSync(source, { throws: false })

if (!endpoints) {
  console.log('Invalid JSON file.')
  process.exit(1)
}

function executeMap (config, urlDescription, done) {
  const command = 'sqlmap/sqlmap.py'
  const params = [
    `--url=${urlDescription.url}`,
    `--method=${urlDescription.method}`,
    `--headers=${urlDescription.headers}`,
    `--level=${config.level}`,
    `--risk=${config.risk}`,
    `--dbms=${config.dbms}`,
    `--timeout=${config.timeout}`,
    `-v`, `${config.verbose}`,
    `--flush-session`,
    `--batch`
  ]
  if (urlDescription.params) {
    params.push(`-p`)
    params.push(`${urlDescription.params}`)
  }
  if (urlDescription.data) {
    params.push(`--data=${urlDescription.data}`)
  }

  console.log(chalk.green('executing sqlmap with: ', params.join(' ')))

  const sql = spawn(command, params)
  let vulnerabilities = false

  sql.stdout.on('data', (data) => {
    if (data.length > 1) {
      console.log(`sqlmap: ${data}`)
    }
    if (data.indexOf('identified the following injection') >= 0) {
      vulnerabilities = true
    }
  })

  sql.stderr.on('data', (data) => {
    done(data)
  })

  sql.on('error', (error) => {
    console.log(chalk.red(error))
    done(new Error('failed to start child process'))
  })

  sql.on('close', (code) => {
    console.log(chalk.green(`child process exited with code ${code}\n`))
    done(null, vulnerabilities)
  })
}

const hapi = spawn('node', ['lib/server/start.js'])

hapi.stdout.once('data', (data) => {
  console.log(chalk.green(`hapi: ${data}`))

  async.everySeries(endpoints.urls, (urlDescription, done) => {
    executeMap(endpoints, urlDescription, (err, vulnerabilities) => {
      if (err) {
        console.log(chalk.red(err))
        return done(err, false)
      }

      done(null, !vulnerabilities)
    })
  }, (err, result) => {
    if (err) {
      console.log(chalk.red(err))
      return process.exit(1)
    }

    console.log('\n\n')
    hapi.kill()
    if (result) {
      console.log(chalk.green('no injection vulnerabilities found\n\n`'))
      return process.exit(0)
    } else {
      console.log(chalk.red('[CRITICAL] FOUND injection vulnerabilities\n\n'))
      return process.exit(1)
    }
  })
})

hapi.stderr.on('data', (data) => {
  console.log(chalk.red(`stderr: ${data}`))
})

hapi.on('close', (code) => {
  console.log(chalk.green(`child process exited with code ${code}`))
})
