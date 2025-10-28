import axios from 'axios';

const checkLinkExists = async (url: string): Promise<boolean> => {
    try {
        const response = await axios.head(url);
        return response.status === 200;
    } catch (error) {
        return false;
    }
};

export const checkShopeeLinks = async (links: string[]): Promise<{ link: string; exists: boolean }[]> => {
    const results = await Promise.all(links.map(async (link) => {
        const exists = await checkLinkExists(link);
        return { link, exists };
    }));
    return results;
};