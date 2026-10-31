/*!
Copyright Joyent, Inc. and other Node contributors.

Permission is hereby granted, free of charge, to any person obtaining a
copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the
following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
USE OR OTHER DEALINGS IN THE SOFTWARE.
*/


function Url () {
  this.protocol = null
  this.slashes = null
  this.auth = null
  this.port = null
  this.hostname = null
  this.hash = null
  this.search = null
  this.pathname = null
}


const protocolPattern = /^([a-z0-9.+-]+:)/i
const portPattern = /:[0-9]*$/

/* eslint-disable-next-line no-useless-escape */
const simplePathPattern = /^(\/\/?(?!\/)[^\?\s]*)(\?[^\s]*)?$/

const delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t']

const unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims)

const autoEscape = ['\''].concat(unwise)
const nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape)
const hostEndingChars = ['/', '?', '#']
const hostnameMaxLen = 255
const hostnamePartPattern = /^[+a-z0-9A-Z_-]{0,63}$/
const hostnamePartStart = /^([+a-z0-9A-Z_-]{0,63})(.*)$/
const hostlessProtocol = {
  javascript: true,
  'javascript:': true
}
const slashedProtocol = {
  http: true,
  https: true,
  ftp: true,
  gopher: true,
  file: true,
  'http:': true,
  'https:': true,
  'ftp:': true,
  'gopher:': true,
  'file:': true
}

function urlParse (url, slashesDenoteHost) {
  if (url && url instanceof Url) return url

  const u = new Url()
  u.parse(url, slashesDenoteHost)
  return u
}

Url.prototype.parse = function (url, slashesDenoteHost) {
  let lowerProto, hec, slashes
  let rest = url

  rest = rest.trim()

  if (!slashesDenoteHost && url.split('#').length === 1) {
    const simplePath = simplePathPattern.exec(rest)
    if (simplePath) {
      this.pathname = simplePath[1]
      if (simplePath[2]) {
        this.search = simplePath[2]
      }
      return this
    }
  }

  let proto = protocolPattern.exec(rest)
  if (proto) {
    proto = proto[0]
    lowerProto = proto.toLowerCase()
    this.protocol = proto
    rest = rest.substr(proto.length)
  }

  /* eslint-disable-next-line no-useless-escape */
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    slashes = rest.substr(0, 2) === '//'
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2)
      this.slashes = true
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {


    let hostEnd = -1
    for (let i = 0; i < hostEndingChars.length; i++) {
      hec = rest.indexOf(hostEndingChars[i])
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec
      }
    }

    let auth, atSign
    if (hostEnd === -1) {
      atSign = rest.lastIndexOf('@')
    } else {
      atSign = rest.lastIndexOf('@', hostEnd)
    }

    if (atSign !== -1) {
      auth = rest.slice(0, atSign)
      rest = rest.slice(atSign + 1)
      this.auth = auth
    }

    hostEnd = -1
    for (let i = 0; i < nonHostChars.length; i++) {
      hec = rest.indexOf(nonHostChars[i])
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd)) {
        hostEnd = hec
      }
    }
    if (hostEnd === -1) {
      hostEnd = rest.length
    }

    if (rest[hostEnd - 1] === ':') { hostEnd-- }
    const host = rest.slice(0, hostEnd)
    rest = rest.slice(hostEnd)

    this.parseHost(host)

    this.hostname = this.hostname || ''

    const ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']'

    if (!ipv6Hostname) {
      const hostparts = this.hostname.split(/\./)
      for (let i = 0, l = hostparts.length; i < l; i++) {
        const part = hostparts[i]
        if (!part) { continue }
        if (!part.match(hostnamePartPattern)) {
          let newpart = ''
          for (let j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              newpart += 'x'
            } else {
              newpart += part[j]
            }
          }
          if (!newpart.match(hostnamePartPattern)) {
            const validParts = hostparts.slice(0, i)
            const notHost = hostparts.slice(i + 1)
            const bit = part.match(hostnamePartStart)
            if (bit) {
              validParts.push(bit[1])
              notHost.unshift(bit[2])
            }
            if (notHost.length) {
              rest = notHost.join('.') + rest
            }
            this.hostname = validParts.join('.')
            break
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = ''
    }

    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2)
    }
  }

  const hash = rest.indexOf('#')
  if (hash !== -1) {
    this.hash = rest.substr(hash)
    rest = rest.slice(0, hash)
  }
  const qm = rest.indexOf('?')
  if (qm !== -1) {
    this.search = rest.substr(qm)
    rest = rest.slice(0, qm)
  }
  if (rest) { this.pathname = rest }
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = ''
  }

  return this
}

Url.prototype.parseHost = function (host) {
  let port = portPattern.exec(host)
  if (port) {
    port = port[0]
    if (port !== ':') {
      this.port = port.substr(1)
    }
    host = host.substr(0, host.length - port.length)
  }
  if (host) { this.hostname = host }
}

export default urlParse
