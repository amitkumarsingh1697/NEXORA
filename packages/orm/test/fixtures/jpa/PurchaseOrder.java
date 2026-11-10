package shop.model;

import jakarta.persistence.*;
import java.math.BigDecimal;

@Entity
public class PurchaseOrder extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "customer_id")
    private Customer customer;

    @ManyToOne
    private Customer referrer;

    @Column(precision = 10, scale = 2)
    private BigDecimal total;

    @Enumerated(EnumType.STRING)
    private Status status;
}
