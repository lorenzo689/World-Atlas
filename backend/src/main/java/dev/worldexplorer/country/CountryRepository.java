package dev.worldexplorer.country;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CountryRepository extends JpaRepository<Country, String> {

    Optional<Country> findByCode2IgnoreCase(String code2);

    List<Country> findAllByOrderByNameAsc();
}
