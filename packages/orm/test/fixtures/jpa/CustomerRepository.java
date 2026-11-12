package shop.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import shop.model.Customer;

public interface CustomerRepository extends JpaRepository<Customer, Long> {
    Customer findByEmail(String email);
}
