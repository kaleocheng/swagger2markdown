#!/usr/bin/env node

const SwaggerParser = require('swagger-parser')
const Swagmock = require('swagmock')
const Mustache = require('mustache')
const fs = require('fs')

function getRequireBody(name, obj, result) {
    const nameset = new Set([])
    const ofKeys = ['oneOf', 'anyOf', 'allOf']
    for (let key of ofKeys) {
        if (key in obj) {
            for (let o of obj[key]) {
                let r = []
                getRequireBody('', o, r)
                result.push(r)
            }
        }
    }

    if (!('type' in obj)) {
        obj.type = 'object'
    }

    if (!nameset.has(name) && name != '') {
        result.push({
            name: name,
            description: obj.description || name,
            type: obj.format || obj.type
        })
        nameset.add(name)
    }

    switch (obj.type) {
        case 'object':
            if ('properties' in obj) {
                for (let n of Object.keys(obj.properties)) {
                    let newName = (name == '') ? n : `${name}.${n}`
                    getRequireBody(newName, obj.properties[n], result)
                }
            }
            break
        case 'array':
            if ('items' in obj) {
                getRequireBody(`${name}[item]`, obj.items, result)
            }
            break
    }

}

async function getItems(api) {
    const items = []
    const paths = Object.keys(api.paths)
    let mockgen = Swagmock(api, {
        validated: true
    })
    for (let p of paths) {
        const methods = Object.keys(api.paths[p])
        for (let m of methods) {
            const item = {}
            const apiItem = api.paths[p][m]
            item.title = `${m} ${p}`
            item.seq = `${m}${p.replace(/\//g, '-')}`
            item.path = p
            item.method = m
            item.description = apiItem.description
            item.parameters = apiItem.parameters || []
            item.requestbody = apiItem.requestBody && apiItem.requestBody.content && apiItem.requestBody.content['application/json'] && apiItem.requestBody.content['application/json'].schema || []
            item.responses = []
            for (let code of Object.keys(apiItem.responses)) {
                let r = apiItem.responses[code]
                r.code = code
                r.responsebody = apiItem.responses[code] && apiItem.responses[code].content && apiItem.responses[code].content['application/json'] && apiItem.responses[code].content['application/json'].schema || []
                item.responses.push(r)
            }

            items.push(item)
        }
    }


    for (let item of items) {
        let bodyItems = []
        getRequireBody('', item.requestbody, bodyItems)
        if (!Array.isArray(bodyItems[0])) {
            item.requestbody = []
            item.requestbody.push(bodyItems)
        } else {
            item.requestbody = bodyItems
        }


        for (let r of item.responses) {
            let bodyItems = []
            getRequireBody('', r.responsebody, bodyItems)
            if (!Array.isArray(bodyItems[0])) {
                r.responsebody = []
                r.responsebody.push(bodyItems)
            } else {
                r.responsebody = bodyItems
            }
            r.responseMock = []
            mock = await mockgen.responses({
                path: item.path,
                operation: item.method,
                response: r.code
            })
            if (mock) {
                r.responseMock.push(JSON.stringify(mock.responses, null, 2))
            }
        }

    }
    return items
}

async function render(templateFile, swaggerFile) {
    const api = await SwaggerParser.validate(swaggerFile)
    const items = await getItems(api)
    const template = fs.readFileSync(templateFile, 'utf8')
    return Mustache.render(template, items);
}

module.exports = {
    render: render
}
