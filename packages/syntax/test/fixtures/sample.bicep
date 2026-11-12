param location string = resourceGroup().location
param name string

module net './network.bicep' = {
  name: 'net'
  params: { location: location }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: name
  location: location
  kind: 'StorageV2'
}

output id string = storage.id
