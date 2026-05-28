# Geo-redundant Backup Configuration for PostgreSQL
resource "azurerm_postgresql_flexible_server" "geo_redundant_postgresql" {
  name                   = "postgresql-vio-platform"
  resource_group_name    = azurerm_resource_group.vio_resource_group.name
  location               = azurerm_resource_group.vio_resource_group.location
  version                = "13"
  sku_name               = "GP_Standard_D2s_v3"
  storage_mb             = 32768
  administrator_login    = "pgadmin"
  administrator_password = azurerm_key_vault_secret.db_password.value
  delegated_subnet_id    = azurerm_subnet.postgresql_subnet.id
  private_dns_zone_id    = azurerm_virtual_network.vio_vnet.id
  public_network_access_enabled = false

  backup_retention_days           = 35
  geo_redundant_backup_enabled    = true
}