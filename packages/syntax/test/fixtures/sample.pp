class shop::web (
  String $docroot = '/var/www',
  Integer $port,
) inherits shop::params {
  include shop::firewall
  package { 'nginx': ensure => installed }
  service { 'nginx': ensure => running, require => Package['nginx'] }
}

define shop::vhost (String $name) {
  file { "/etc/nginx/${name}.conf": ensure => file }
}
