package shop.model;

import jakarta.persistence.*;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "customers")
public class Customer extends BaseEntity {
    @Column(nullable = false, unique = true, length = 254)
    private String email;

    private String displayName;

    @Transient
    private String cached;

    private static final long serialVersionUID = 1L;

    @Embedded
    private Address address;

    @OneToMany(mappedBy = "customer")
    private List<PurchaseOrder> orders;

    @ManyToMany
    @JoinTable(name = "customer_tags",
        joinColumns = @JoinColumn(name = "customer_id"),
        inverseJoinColumns = @JoinColumn(name = "tag_id"))
    private Set<Tag> tags;
}
