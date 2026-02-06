// Large test data generator - completely isolated utility
const fruits = ["Apple", "Banana", "Cherry", "Date", "Elderberry", "Fig", "Grape", "Honeydew", "Kiwi", "Lemon", "Mango", "Nectarine", "Orange", "Papaya", "Quince", "Raspberry", "Strawberry", "Tangerine", "Ugli", "Vanilla", "Watermelon"];
const animals = ["Aardvark", "Bear", "Cat", "Dog", "Elephant", "Fox", "Giraffe", "Hippo", "Iguana", "Jaguar", "Koala", "Lion", "Moose", "Newt", "Owl", "Panda", "Quail", "Rabbit", "Snake", "Tiger", "Urchin", "Vulture", "Wolf", "X-ray fish", "Yak", "Zebra"];
const cars = ["Audi", "BMW", "Chevrolet", "Dodge", "Ferrari", "GMC", "Honda", "Infiniti", "Jaguar", "Kia", "Lexus", "Mazda", "Nissan", "Opel", "Porsche", "Qvale", "Renault", "Subaru", "Toyota", "Ultima", "Volkswagen", "Willys", "Xpeng", "Yamaha", "Zenvo"];
const countries = ["Argentina", "Brazil", "Canada", "Denmark", "Egypt", "France", "Germany", "Honduras", "India", "Japan", "Kenya", "Lebanon", "Mexico", "Norway", "Oman", "Portugal", "Qatar", "Russia", "Spain", "Turkey", "Uganda", "Vietnam", "Wales", "Yemen", "Zimbabwe"];
const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "CNY", "SEK", "NZD", "MXN", "SGD", "HKD", "NOK", "KRW", "TRY", "RUB", "INR", "BRL", "ZAR"];
const cities = ["Amsterdam", "Berlin", "Chicago", "Dubai", "Edinburgh", "Florence", "Geneva", "Helsinki", "Istanbul", "Jakarta", "Kiev", "London", "Madrid", "Naples", "Oslo", "Paris", "Quebec", "Rome", "Sydney", "Tokyo", "Utrecht", "Vienna", "Warsaw", "Xian", "York", "Zurich"];
const colors = ["Red", "Blue", "Green", "Yellow", "Orange", "Purple", "Pink", "Brown", "Black", "White", "Gray", "Cyan", "Magenta", "Lime", "Navy", "Teal", "Silver", "Gold", "Crimson", "Violet"];
const towns = ["Ashford", "Bedford", "Chester", "Dover", "Exeter", "Fairfield", "Guildford", "Halifax", "Ipswich", "Jarrow", "Kendal", "Leeds", "Milton", "Newark", "Oxford", "Preston", "Quinton", "Reading", "Sheffield", "Telford"];
const postcodes = ["SW1A 1AA", "EC1A 1BB", "W1A 0AX", "M1 1AE", "B1 1AA", "LS1 1UR", "L1 8JQ", "EH1 1YZ", "CF10 1BH", "G1 1AA"];

function randomItem(arr: any[]) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomNumber(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomizeValue(value: any): any {
    if (typeof value === 'string') {
        // Replace with random data based on content
        const lower = value.toLowerCase();
        if (lower.includes('name') || lower.includes('title')) return randomItem([...fruits, ...animals, ...towns]);
        if (lower.includes('country')) return randomItem(countries);
        if (lower.includes('city') || lower.includes('town')) return randomItem(cities);
        if (lower.includes('color') || lower.includes('colour')) return randomItem(colors);
        if (lower.includes('car') || lower.includes('vehicle')) return randomItem(cars);
        if (lower.includes('currency')) return randomItem(currencies);
        if (lower.includes('post') || lower.includes('zip')) return randomItem(postcodes);
        if (lower.includes('code')) return randomItem(['A', 'B', 'C', 'D', 'E']) + randomNumber(100, 999);
        // Default random string
        return randomItem([...fruits, ...animals, ...cars, ...cities]);
    } else if (typeof value === 'number') {
        return randomNumber(1, 10000);
    } else if (typeof value === 'boolean') {
        return Math.random() > 0.5;
    }
    return value;
}

function cloneAndRandomize(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(item => cloneAndRandomize(item));
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            newObj[key] = cloneAndRandomize(obj[key]);
        }
        return newObj;
    } else {
        return randomizeValue(obj);
    }
}

export function generateLargeTestData(template: any, count = 10000) {
    // Find the first array in the template
    function findFirstArray(obj: any, path = ''): { array: any[], path: string } | null {
        if (Array.isArray(obj) && obj.length > 0) {
            return { array: obj, path };
        }
        if (obj !== null && typeof obj === 'object') {
            for (const key in obj) {
                const result = findFirstArray(obj[key], path ? `${path}.${key}` : key);
                if (result) return result;
            }
        }
        return null;
    }

    const arrayInfo = findFirstArray(template);
    if (!arrayInfo) {
        alert('No array found in template data to expand');
        return null;
    }

    const result = JSON.parse(JSON.stringify(template));

    // Get the array to expand
    let targetArray = result;
    // Fix for root array where path is empty
    if (arrayInfo.path) {
        const parts = arrayInfo.path.split('.');
        for (let i = 0; i < parts.length; i++) {
            targetArray = targetArray[parts[i]];
        }
    }

    // Use first item as template for new items
    const itemTemplate = targetArray[0];

    // Generate new items
    targetArray.length = 0; // Clear existing
    for (let i = 0; i < count; i++) {
        targetArray.push(cloneAndRandomize(itemTemplate));
    }

    return result;
}
