[out:json][timeout:120][maxsize:268435456];
area["ISO3166-1"="JP"]["admin_level"="2"]->.country;
nwr["amenity"="toilets"](area.country);
out center tags;
