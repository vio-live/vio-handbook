provider "azurerm" {
  features {}
}

# Azure Key Vault
resource "azurerm_key_vault" "vio_kv" {
  name                = "kv-vio-platform"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  sku_name            = "standard"
  tenant_id           = data.azurerm_client_config.current.tenant_id
  purge_protection_enabled = true # Recommended for production
}

resource "azurerm_key_vault_secret" "db_password" {
  name         = "postgresql-admin-password"
  value        = "${random_password.db_password.result}"
  key_vault_id = azurerm_key_vault.vio_kv.id
}

# Generate a secure password
resource "random_password" "db_password" {
  length    = 16
  special   = true
  override_special = "_@"
}

# PostgreSQL Flexible Server integration with Key Vault
resource "azurerm_postgresql_flexible_server" "vio_postgresql" {
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
}