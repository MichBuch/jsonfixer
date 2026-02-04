export const fruitCatalog = {
  view: {
    name: "Fruit Catalog",
    version: "1.0",
    classes: {
      pear: {
        productDesc: "European pears",
        attributes: [{ name: "Conference", vitaminC: "5%", colour: "green", edible: true, sourceCountry: "Belgium", fruitCode: "PR-CF-001" }],
      },
      mango: {
        productDesc: "Tropical mangoes",
        attributes: [{ name: "Kent", vitaminC: "46%", colour: "yellow", edible: true, sourceCountry: "Peru", fruitCode: "MNG-KT-001" }],
      },
      banana: {
        productDesc: "Tropical bananas",
        attributes: [{ name: "Cavendish", vitaminC: "15%", colour: "yellow", edible: true, sourceCountry: "Ecuador", fruitCode: "BAN-CV-001" }],
      },
      apple: {
        productDesc: "Premium apple varieties",
        attributes: [
          { name: "Granny Smith", vitaminC: "12%", colour: "green", edible: true, sourceCountry: "Australia", fruitCode: "APL-GS-001" },
          { name: "Royal Gala", vitaminC: "8%", colour: "red", edible: true, sourceCountry: "New Zealand", fruitCode: "APL-RG-002" },
        ],
      },
      orange: {
        productDesc: "Citrus varieties",
        attributes: [{ name: "Valencia", vitaminC: "80%", colour: "orange", edible: true, sourceCountry: "Spain", fruitCode: "ORG-VL-001" }],
      },
    },
  },
} as const;

export const vehicleInventory = {
  view: {
    name: "Vehicle Inventory",
    version: "2.1",
    classes: {
      cars: {
        porsche: {
          speed: 220,
          breaking: 10,
          engine: {
            size: "4l",
            pistons: 8,
            lubrication: "oil",
            gaskets: 10,
            turbo: "yes",
            power: "petrol",
          },
        },
        audi: {
          speed: 190,
          breaking: 5,
          engine: {
            size: "2l",
            pistons: 6,
            lubrication: "oil",
            gaskets: 8,
            turbo: "no",
            power: "electric",
          },
        },
        beetle: {
          speed: 90,
          breaking: 15,
          engine: {
            size: "1l",
            pistons: 4,
            lubrication: "oil",
            gaskets: 4,
            turbo: "no",
            power: "diesel",
          },
        },
      },
    },
  },
} as const;

export const deepHierarchy = {
  view: {
    name: "Data Classification View",
    version: "1.0",
    classes: {
      product: {
        productDesc: "Product classification",
        attributes: [
          {
            name: "apple",
            attributes: [
              { name: "Granny Smith", vitaminC: "80%", colour: "red", edible: true, metadata: { sourceCountry: "Australia", fruitCode: "APL-GS-001" } },
            ],
          },
        ],
      },
    },
  },
} as const;
