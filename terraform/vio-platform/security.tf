# Application Gateway with Web Application Firewall (WAF)
resource "azurerm_application_gateway" "vio_app_gateway" {
  name                = "app-gateway-vio"
  resource_group_name = azurerm_resource_group.vio_resource_group.name
  location            = azurerm_resource_group.vio_resource_group.location
  sku {
    name     = "WAF_v2"
    tier     = "WAF_v2"
    capacity = 2 # Minimum autoscaling capacity
  }

  gateway_ip_configuration {
    name      = "gateway-ip-config"
    subnet_id = azurerm_subnet.aks_subnet.id
  }

  frontend_ip_configuration {
    name                 = "frontend-ip"
    private_ip_address   = "10.0.0.100"
    private_ip_address_allocation = "Static"
  }

  frontend_port {
    name = "http-port"
    port = 80
  }

  frontend_port {
    name = "https-port"
    port = 443
  }

  backend_address_pool {
    name = "aks-backend-pool"
  }

  http_listener {
    name                           = "http-listener"
    frontend_ip_configuration_name = "frontend-ip"
    frontend_port_name             = "https-port"
    protocol                       = "Https"
    ssl_certificate_name           = "vio-ssl-cert"
  }

  request_routing_rule {
    name                       = "aks-routing-rule"
    rule_type                  = "Basic"
    http_listener_name         = "http-listener"
    backend_address_pool_name  = "aks-backend-pool"
    backend_http_settings_name = "http-settings"
  }

  backend_http_settings {
    name                  = "http-settings"
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 60
  }

  waf_configuration {
    enabled               = true
    firewall_mode         = "Prevention"
    rule_set_type         = "OWASP"
    rule_set_version      = "3.1"
  }
}