#!/bin/bash

# Hyperscape Package Control Script
# Manage individual packages and services independently

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_info() {
    echo -e "${BLUE}ℹ ${NC}$1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Show usage
show_help() {
    cat << EOF
${BLUE}Hyperscape Package Control${NC}

Usage: ./scripts/control.sh [COMMAND] [SERVICE]

${GREEN}Commands:${NC}
  start <service>     Start a specific service
  stop <service>      Stop a specific service
  restart <service>   Restart a specific service
  status              Show status of all services
  logs <service>      Show logs for a service
  clean               Stop all services and clean up

${GREEN}Docker Services:${NC}
  postgres            PostgreSQL database (port 5432)
  cdn                 Asset CDN server (port 8080)
  all                 All Docker services (postgres + cdn)

${GREEN}App Packages (run directly on host):${NC}
  Use these commands instead:
    bun run start:shared    # Core ECS engine
    bun run start:server    # Game server (port 5555)
    bun run start:client    # Web client (port 3333)
    bun run start:docs      # Documentation (port 3000)

${GREEN}Examples:${NC}
  ./scripts/control.sh start postgres       # Start just PostgreSQL
  ./scripts/control.sh start server         # Start server (and dependencies)
  ./scripts/control.sh status               # Check what's running
  ./scripts/control.sh logs server          # View server logs
  ./scripts/control.sh stop all             # Stop everything

${GREEN}Quick Start:${NC}
  docker-compose up -d postgres cdn         # Start infrastructure
  bun run dev:shared                        # Start shared package
  bun run dev:server                        # Start server in another terminal
  bun run dev:client                        # Start client in another terminal

EOF
}

# Check if Docker is running
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker Desktop."
        exit 1
    fi
}

# Get service status
get_status() {
    local service=$1
    if docker ps --format '{{.Names}}' | grep -q "hyperscape-$service"; then
        echo "running"
    else
        echo "stopped"
    fi
}

# Start a service
start_service() {
    local service=$1
    check_docker

    case $service in
        postgres|cdn)
            print_info "Starting $service..."
            docker-compose up -d $service
            print_success "$service started"
            ;;
        all)
            print_info "Starting all Docker services..."
            docker-compose up -d
            print_success "All Docker services started (postgres, cdn)"
            print_info "To start app packages, use: bun run start:shared, start:server, start:client"
            ;;
        shared|server|client|docs)
            print_error "$service is not a Docker service"
            print_info "Run it directly with: bun run start:$service"
            exit 1
            ;;
        *)
            print_error "Unknown service: $service"
            show_help
            exit 1
            ;;
    esac
}

# Stop a service
stop_service() {
    local service=$1
    check_docker

    case $service in
        postgres|cdn|shared|server|client|docs)
            print_info "Stopping $service..."
            docker-compose stop $service
            print_success "$service stopped"
            ;;
        all)
            print_info "Stopping all services..."
            docker-compose down
            print_success "All services stopped"
            ;;
        *)
            print_error "Unknown service: $service"
            exit 1
            ;;
    esac
}

# Restart a service
restart_service() {
    local service=$1
    print_info "Restarting $service..."
    stop_service $service
    sleep 2
    start_service $service
}

# Show status of all services
show_status() {
    print_info "Hyperscape Services Status:"
    echo ""

    printf "%-20s %-10s %-30s\n" "DOCKER SERVICE" "STATUS" "PORTS"
    printf "%-20s %-10s %-30s\n" "--------------" "------" "-----"

    # Docker infrastructure services
    services=(postgres cdn)
    ports=("5432" "8080")

    for i in "${!services[@]}"; do
        service="${services[$i]}"
        port="${ports[$i]}"
        status=$(get_status "$service")

        if [ "$status" = "running" ]; then
            printf "${GREEN}%-20s %-10s %-30s${NC}\n" "$service" "●running" "$port"
        else
            printf "%-20s %-10s %-30s\n" "$service" "○stopped" "$port"
        fi
    done

    echo ""
    print_info "App Packages (run on host):"
    printf "%-20s %-40s\n" "PACKAGE" "COMMAND"
    printf "%-20s %-40s\n" "-------" "-------"
    printf "%-20s %-40s\n" "shared" "bun run start:shared"
    printf "%-20s %-40s\n" "server" "bun run start:server"
    printf "%-20s %-40s\n" "client" "bun run start:client"
    printf "%-20s %-40s\n" "docs" "bun run start:docs"
    echo ""
    print_info "Use './scripts/control.sh logs <service>' to view Docker logs"
}

# Show logs for a service
show_logs() {
    local service=$1
    check_docker

    if [ -z "$service" ]; then
        docker-compose logs -f
    else
        docker-compose logs -f $service
    fi
}

# Clean up everything
clean_all() {
    print_warning "Stopping all services and cleaning up..."
    docker-compose down -v
    print_success "Cleanup complete"
}

# Main script logic
case ${1:-} in
    start)
        start_service ${2:-all}
        ;;
    stop)
        stop_service ${2:-all}
        ;;
    restart)
        restart_service ${2:-all}
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs ${2:-}
        ;;
    clean)
        clean_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        show_help
        exit 1
        ;;
esac
