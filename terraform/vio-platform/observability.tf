# Observability Integration: Azure Monitor and Insights

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "vio_workspace" {
  name                = "log-vio-platform"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

# Diagnostic Settings for AKS with Container Insights
resource "azurerm_monitor_diagnostic_setting" "aks_logs" {
  name               = "aks-diagnostic-settings"
  target_resource_id = azurerm_kubernetes_cluster.vio_aks.id

  log_analytics_workspace_id = azurerm_log_analytics_workspace.vio_workspace.id

  logs {
    category = "kube-apiserver"
    enabled  = true
    retention_policy {
      days    = 30
      enabled = true
    }
  }

  logs {
    category = "cluster-autoscaler"
    enabled  = true
  }

  metrics {
    category = "AllMetrics"
    enabled  = true
    retention_policy {
      days    = 30
      enabled = true
    }
  }
}

# Application Insights for Distributed Tracing
resource "azurerm_application_insights" "vio_insights" {
  name                = "app-insights-vio"
  location            = azurerm_resource_group.vio_resource_group.location
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  application_type    = "web"
  ingestion_enabled   = true
  retention_in_days   = 90 # Longer retention based on need
}