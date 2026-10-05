// Marcas de carro conhecidas — usadas pra manter o select de Marca limpo (o OLX/IA
// às vezes devolve lixo: peças, imóveis, categorias que não são marca de veículo).

const CAR_BRANDS = [
  "Acura", "Agrale", "Alfa Romeo", "Aston Martin", "Audi", "Bentley", "BMW", "BYD", "Caoa Chery",
  "Chery", "Chevrolet", "Chrysler", "Citroën", "Citroen", "Dodge", "DS", "Effa", "Ferrari", "Fiat",
  "Ford", "GAC", "GWM", "Geely", "Honda", "Hyundai", "Infiniti", "Jac", "Jaguar", "Jeep", "Jetour",
  "Kia", "Lada", "Lamborghini", "Land Rover", "Lexus", "Lifan", "Lotus", "Mahindra", "Maserati",
  "Mazda", "McLaren", "Mercedes-Benz", "Mercedes", "MG", "Mini", "Mitsubishi", "Nissan", "Omoda",
  "Peugeot", "Porsche", "RAM", "Renault", "Rolls-Royce", "Rover", "Saab", "Seat", "Smart",
  "Ssangyong", "Subaru", "Suzuki", "Tesla", "Toyota", "Troller", "Volkswagen", "VW", "Volvo",
];

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const BRAND_SET = new Set(CAR_BRANDS.map(norm));

export function isCarBrand(marca: string | null | undefined): boolean {
  return !!marca && BRAND_SET.has(norm(marca));
}
