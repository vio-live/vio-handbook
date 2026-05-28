

# Centralized Resource Group for Vio
resource "azurerm_resource_group" "vio_resource_group" {
  name     = "rg-vio-platform-prod"
  location = "East US"
}

# Virtual Network
resource "azurerm_virtual_network" "vio_vnet" {
  name                = "vnet-vio-platform"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  address_space       = ["10.0.0.0/16"]
}

# Subnet for AKS
resource "azurerm_subnet" "aks_subnet" {
  name                 = "aks-subnet"
  resource_group_name  = azurerm_resource_group.vio_resource_group.name
  virtual_network_name = azurerm_virtual_network.vio_vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Subnet for PostgreSQL
resource "azurerm_subnet" "postgresql_subnet" {
  name                 = "postgresql-subnet"
  resource_group_name  = azurerm_resource_group.vio_resource_group.name
  virtual_network_name = azurerm_virtual_network.vio_vnet.name
  address_prefixes     = ["10.0.2.0/24"]
  delegations {
    name = "postgresqlDelegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# AKS Cluster
resource "azurerm_kubernetes_cluster" "vio_aks" {
  name                = "aks-vio-platform"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  default_node_pool {
    name       = "usernodes"
    vm_size    = "Standard_D4s_v3"
    enable_auto_scaling = true
    min_count  = 2
    max_count  = 10
  }
  identity {
    type = "SystemAssigned"
  }
  network_profile {
    network_plugin     = "azure"
    network_policy     = "azure"
    load_balancer_sku  = "standard"
    dns_service_ip     = "10.0.0.10"
    service_cidr       = "10.0.0.0/16"
    docker_bridge_cidr = "172.17.0.1/16"
  }
}


  name                   = "postgresql-vio-platform"
  resource_group_name    = azurerm_resource_group.vio_resource_group.name
  location               = azurerm_resource_group.vio_resource_group.location
  version                = "13"
  sku_name               = "GP_Standard_D2s_v3"
  storage_mb             = 32768
  administrator_login    = "pgadmin"
  administrator_password = "CHANGEME123@"
  delegated_subnet_id    = azurerm_subnet.postgresql_subnet.id
  private_dns_zone_id    = azurerm_virtual_network.vio_vnet.id
  public_network_access_enabled = false
}