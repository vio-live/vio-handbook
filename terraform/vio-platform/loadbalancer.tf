# Load Balancer for AKS Public Access
resource "azurerm_lb" "aks_lb" {
  name                = "aks-prod-lb"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  sku                 = "Standard"
}

# Frontend IP Configuration
resource "azurerm_lb_frontend_ip_configuration" "prod_aks_lb_config" {
  name                 = "aks-lb-frontend"
  resource_group_name  = azurerm_resource_group.vio_resource_group.name
  loadbalancer_id      = azurerm_lb.aks_lb.id
  subnet_id            = azurerm_subnet.aks_subnet.id
  private_ip_address_allocation = "Dynamic"
}

# Load Balancer Rules
resource "azurerm_lb_rule" "aks_lb_rule" {
  name                           = "HTTP-rule"
  resource_group_name            = azurerm_resource_group.vio_resource_group.name
  loadbalancer_id                = azurerm_lb.aks_lb.id
  protocol                       = "Tcp"
  frontend_port                  = 80
  backend_port                   = 80
  frontend_ip_configuration_name = azurerm_lb_frontend_ip_configuration.prod_aks_lb_config.name
}

# PostgreSQL Replication Configuration
resource "azurerm_postgresql_flexible_server" "postgresql_replica" {
  lifecycle {
    prevent_destroy = true
  }

  name                   = "postgresql-read-replica"
  resource_group_name    = azurerm_resource_group.vio_resource_group.name
  location               = azurerm_resource_group.vio_resource_group.location
  create_mode            = "Replica"
  source_server_id       = azurerm_postgresql_flexible_server.vio_postgresql.id

  sku_name               = "GP_Standard_D2s_v3"
  storage_mb             = 32768
  delegated_subnet_id    = azurerm_subnet.postgresql_subnet.id
  private_dns_zone_id    = azurerm_virtual_network.vio_vnet.id
  public_network_access_enabled = false
}