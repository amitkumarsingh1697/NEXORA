package shop.model;

import jakarta.persistence.Embeddable;

@Embeddable
public class Address {
    private String street;
    private String city;
}
