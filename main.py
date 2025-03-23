import requests
import json

headers = {
    'Accept': 'application/json',
    'api-token': ""
}

provider = 'gh'
remoteOrganizationName = 'aiden-perkins'

r = requests.get(f'https://app.codacy.com/api/v3/analysis/organizations/{provider}/{remoteOrganizationName}/repositories', headers = headers)

print(r.status_code)

print(r.text)

print(r.json())

f = open('temp.json', 'w')

f.write(json.dumps(r.json(), indent=4))
