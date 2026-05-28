provider "azurerm" {
  features {}
}

# Resource group for production environment
resource "azurerm_resource_group" "production" {
  name     = "rg-socket-server-prod"
  location = "East US"
}

# Virtual Network
resource "azurerm_virtual_network" "production_vnet" {
  name                = "vnet-prod-socket-server"
  location            = azurerm_resource_group.production.location
  resource_group_name = azurerm_resource_group.production.name
  address_space       = ["10.0.0.0/16"]
}

# Subnet for AKS
resource "azurerm_subnet" "aks_subnet" {
  name                 = "aks-prod-subnet"
  resource_group_name  = azurerm_resource_group.production.name
  virtual_network_name = azurerm_virtual_network.production_vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

# Subnet for PostgreSQL
resource "azurerm_subnet" "postgresql_subnet" {
  name                 = "postgresql-prod-subnet"
  resource_group_name  = azurerm_resource_group.production.name
  virtual_network_name = azurerm_virtual_network.production_vnet.name
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
resource "azurerm_kubernetes_cluster" "prod_aks" {
  name                = "aks-prod-socket-server"
  location            = azurerm_resource_group.production.location
  resource_group_name = azurerm_resource_group.production.name
  default_node_pool {
    name       = "system"
    vm_size    = "Standard_D2s_v3"
    node_count = 3 # Minimum scalable nodes
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

# PostgreSQL Flexible Server
resource "azurerm_postgresql_flexible_server" "postgresql_prod" {
  name                   = "postgresql-prod-db"
  resource_group_name    = azurerm_resource_group.production.name
  location               = azurerm_resource_group.production.location
  version                = "13"
  sku_name               = "GP_Standard_D2s_v3"
  storage_mb             = 32768 # 32 GB
  administrator_login    = "pgadmin"
  administrator_password = "CHANGEME123@"
  delegated_subnet_id    = azurerm_subnet.postgresql_subnet.id
  private_dns_zone_id    = azurerm_virtual_network.production_vnet.id
  public_network_access_enabled = false
}