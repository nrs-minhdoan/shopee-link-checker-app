// This file contains utility functions that assist with various tasks in the application, such as formatting data or handling errors.
import axios from "axios";

export const formatLink = (link: string): string => {
    return link.trim().replace(/\/+$/, ""); // Remove trailing slashes
};

export const isValidLink = (link: string): boolean => {
    const regex = /^(https?:\/\/)?(www\.)?shopee\.vn\/.+/; // Basic regex for Shopee links
    return regex.test(link);
};

export const handleError = (error: any): string => {
    if (axios.isAxiosError(error)) {
        return error.response?.data?.message || "An error occurred while checking the link.";
    }
    return "An unexpected error occurred.";
};