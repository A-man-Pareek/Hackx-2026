import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    StyleSheet,
    Text,
    View,
    ScrollView,
    TextInput,
    TouchableOpacity,
    SafeAreaView,
    KeyboardAvoidingView,
    Platform,
    Alert,
    Animated,
    Easing
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Network from 'expo-network';
import * as Linking from 'expo-linking';
import { Image, ActivityIndicator, Keyboard, RefreshControl } from 'react-native';

const criteriaList = [
    { id: 'taste', icon: 'restaurant-outline', name: '1. Food Taste', desc: 'The most important factor. How was the flavor?' },
    { id: 'quality', icon: 'leaf-outline', name: '2. Quality & Freshness', desc: 'Were the ingredients fresh and high quality?' },
    { id: 'speed', icon: 'time-outline', name: '3. Service Speed', desc: 'How quickly did your order arrive?' },
    { id: 'staff', icon: 'people-outline', name: '4. Staff Behaviour', desc: 'Was the team polite and helpful?' },
    { id: 'cleanliness', icon: 'sparkles-outline', name: '5. Cleanliness', desc: 'Were the tables and dining area spotless?' },
    { id: 'washroom', icon: 'water-outline', name: '6. Washroom Hygiene', desc: 'Crucial for a great experience. Was it clean?' },
    { id: 'ambience', icon: 'musical-notes-outline', name: '7. Ambience & Atmosphere', desc: 'How were the lighting, music, and overall vibe?' },
    { id: 'value', icon: 'cash-outline', name: '8. Value for Money', desc: 'Was the experience worth the price?' },
    { id: 'portion', icon: 'pie-chart-outline', name: '9. Portion Size', desc: 'Was the quantity reasonable and satisfying?' },
    { id: 'overall', icon: 'heart-outline', name: '10. Overall Experience', desc: 'Your final thoughts on visiting us.' }
];

const staffList = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Vikram', 'Not Sure'];

interface StarRatingProps {
    rating: number;
    onRate: (rating: number) => void;
}

// Interactive Star component with its own bounce animation
const StarRating: React.FC<StarRatingProps> = ({ rating, onRate }) => {
    return (
        <View style={styles.starsContainer}>
            {[1, 2, 3, 4, 5].map((star) => {
                const scaleVal = useRef(new Animated.Value(1)).current;

                const handlePress = () => {
                    onRate(star);
                    // Bounce animation on click
                    Animated.sequence([
                        Animated.timing(scaleVal, {
                            toValue: 1.3,
                            duration: 150,
                            useNativeDriver: true,
                        }),
                        Animated.spring(scaleVal, {
                            toValue: 1,
                            friction: 3,
                            useNativeDriver: true,
                        })
                    ]).start();
                };

                return (
                    <TouchableOpacity key={star} onPress={handlePress} activeOpacity={0.7}>
                        <Animated.View style={{ transform: [{ scale: scaleVal }] }}>
                            <Ionicons
                                name={star <= rating ? "star" : "star-outline"}
                                size={38}
                                color={star <= rating ? "#fbbf24" : "#3f3f46"}
                                style={styles.starIcon}
                            />
                        </Animated.View>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

interface AnimatedCardProps {
    item: {
        id: string;
        icon: any;
        name: string;
        desc: string;
    };
    index: number;
    ratings: { [key: string]: number };
    handleRate: (id: string, rating: number) => void;
}

// Animated Card for each criteria
const AnimatedCard: React.FC<AnimatedCardProps> = ({ item, index, ratings, handleRate }) => {
    const slideAnim = useRef(new Animated.Value(50)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 500,
                delay: index * 100, // Stagger effect
                easing: Easing.out(Easing.back(1.5)),
                useNativeDriver: true,
            }),
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 500,
                delay: index * 100,
                useNativeDriver: true,
            })
        ]).start();
    }, []);

    return (
        <Animated.View style={[
            styles.ratingCard,
            {
                transform: [{ translateY: slideAnim }],
                opacity: fadeAnim
            }
        ]}>
            <View style={styles.cardHeader}>
                <View style={styles.iconCircle}>
                    <Ionicons name={item.icon} size={22} color="#8b5cf6" />
                </View>
                <Text style={styles.cardTitle}>{item.name}</Text>
            </View>
            <Text style={styles.cardDesc}>{item.desc}</Text>
            <StarRating
                rating={ratings[item.id] || 0}
                onRate={(rating) => handleRate(item.id, rating)}
            />
        </Animated.View>
    );
};

export default function App() {
    const [isStarted, setIsStarted] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [ratings, setRatings] = useState<{ [key: string]: number }>({});
    const [staffTag, setStaffTag] = useState('');
    const [comments, setComments] = useState('');
    const [authorName, setAuthorName] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Branch context
    const [branchId, setBranchId] = useState('');
    const [restaurantName, setRestaurantName] = useState('');
    const [branches, setBranches] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isLoadingBranches, setIsLoadingBranches] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Parse deep link URL for branchId and restaurant name
    useEffect(() => {
        const parseUrl = (url: string | null) => {
            if (!url) return;
            try {
                const parsed = Linking.parse(url);
                if (parsed.queryParams?.branchId) {
                    setBranchId(parsed.queryParams.branchId as string);
                } else {
                    fetchPublicBranches();
                }
                if (parsed.queryParams?.name) {
                    setRestaurantName(decodeURIComponent(parsed.queryParams.name as string));
                }
            } catch (e) {
                console.log('Deep link parse error:', e);
                fetchPublicBranches();
            }
        };

        // Check for deep link or fetch branches
        Linking.getInitialURL().then(url => {
            if (url) parseUrl(url);
            else fetchPublicBranches();
        });

        const subscription = Linking.addEventListener('url', (event) => {
            parseUrl(event.url);
        });

        return () => subscription.remove();
    }, []);

    const fetchPublicBranches = async () => {
        setIsLoadingBranches(true);
        setFetchError(null);
        try {
            // Try both localhost (for web) and network IP (for mobile)
            const targetIp = Platform.OS === 'web' ? 'localhost' : '10.130.121.44';
            const response = await fetch(`http://${targetIp}:19002/branches/public`, {
                headers: { 'Accept': 'application/json' }
            });
            const data = await response.json();
            if (data.success) {
                setBranches(data.data);
            } else {
                setFetchError("Failed to load restaurants.");
            }
        } catch (e: any) {
            console.error("Fetch branches error:", e);
            setFetchError("Network error. Please ensure the backend is running.");
        } finally {
            setIsLoadingBranches(false);
        }
    };

    const filteredBranches = useMemo(() => {
        return branches.filter(b => {
            const name = (b.name || '').toLowerCase();
            const location = (b.location || '').toLowerCase();
            const query = searchQuery.toLowerCase();
            return name.includes(query) || location.includes(query);
        });
    }, [branches, searchQuery]);

    const handleSelectBranch = (branch: any) => {
        setBranchId(branch.id);
        setRestaurantName(branch.name);
        setShowQR(true);
    };

    const handleManualSearch = () => {
        Keyboard.dismiss();
        // The list is already live-filtered, but dismissing keyboard provides 
        // the "initialized search" feedback the user expects.
    };

    // Background floating animations
    const floatAnim1 = useRef(new Animated.Value(0)).current;
    const floatAnim2 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Infinite floating background animation
        const createFloatingAnim = (anim: Animated.Value, duration: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    }),
                    Animated.timing(anim, {
                        toValue: 0,
                        duration: duration,
                        easing: Easing.inOut(Easing.sin),
                        useNativeDriver: true,
                    })
                ])
            );
        };

        createFloatingAnim(floatAnim1, 4000).start();
        createFloatingAnim(floatAnim2, 6000).start();
    }, []);

    const handleRate = (id: string, rating: number) => {
        setRatings(prev => ({ ...prev, [id]: rating }));
    };

    const handleSubmit = async () => {
        const missing = criteriaList.filter(c => !ratings[c.id]);

        if (missing.length > 0) {
            Alert.alert('Incomplete Form', 'Please provide a rating for all 10 categories to help us improve!');
            return;
        }

        setIsSubmitting(true);

        // 1. Calculate Average Rating
        let sum = 0;
        const mappedRatings = [];
        for (const key in ratings) {
            sum += ratings[key];
            const name = criteriaList.find(c => c.id === key)?.name;
            mappedRatings.push(`${name}: ${ratings[key]}/5`);
        }
        const averageRating = Math.round(sum / Object.keys(ratings).length);

        // 2. Format detailed review text
        let fullReviewText = `Detailed Ratings:\n${mappedRatings.join('\n')}`;
        if (staffTag) fullReviewText += `\n\nStaff Tagged: ${staffTag}`;
        if (comments) fullReviewText += `\n\nAdditional Comments: ${comments}`;

        try {
            // Because mobile testing IPs change based on Expo tunnel / WSL / local wifi,
            // we will aggressively try the valid local IPs until one connects.
            const targetIps = ['10.130.121.44', '192.168.137.1', '192.168.29.35', '127.0.0.1'];
            let response = null;
            let successIp = null;

            for (const ip of targetIps) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Timeout per IP

                    const tempResponse = await fetch(`http://${ip}:19002/reviews`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            branchId: branchId, // Dynamic from QR code deep link
                            source: 'internal',
                            rating: averageRating,
                            reviewText: fullReviewText,
                            authorName: authorName,
                            phoneNumber: phoneNumber
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (tempResponse.ok) {
                        response = tempResponse;
                        successIp = ip;
                        break; // Stop trying other IPs if this one works
                    }
                } catch (e: any) {
                    // Ignore timeout or network drop and try next IP
                    console.log(`Failed to reach backend at ${ip} - ${e.message}`);
                }
            }

            if (!response) {
                throw new Error(`Failed to submit review: Could not connect to any backend IP. Ensure computer node server is running.`);
            }

            const jsonResponse = await response.json();
            console.log("REST API SUCCESS WITH IP: ", successIp, jsonResponse);

            setSubmitted(true);
        } catch (error: any) {
            console.error("FULL SUBMIT ERROR:", error.message || error);
            Alert.alert('Error', 'Could not submit your review. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const bgTranslateY1 = floatAnim1.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -30]
    });

    const bgTranslateY2 = floatAnim2.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 40]
    });

    if (submitted) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.successContainer}>
                    <Ionicons name="sparkles" size={80} color="#8b5cf6" style={styles.successIcon} />
                    <Text style={styles.successTitle}>Thank You!</Text>
                    <Text style={styles.successDesc}>Your feedback is invaluable in helping us craft the perfect experience.</Text>
                    <TouchableOpacity style={styles.submitBtn} onPress={() => {
                        setRatings({});
                        setStaffTag('');
                        setComments('');
                        setAuthorName('');
                        setPhoneNumber('');
                        setIsStarted(false);
                        setSubmitted(false);
                    }}>
                        <Text style={styles.submitBtnText}>Submit Another Review</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            {/* Background Animated Orbs */}
            <Animated.View style={[styles.bgOrb, styles.orb1, { transform: [{ translateY: bgTranslateY1 }] }]} />
            <Animated.View style={[styles.bgOrb, styles.orb2, { transform: [{ translateY: bgTranslateY2 }] }]} />

            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {!branchId ? (
                    <ScrollView
                        contentContainerStyle={styles.scrollContainer}
                        keyboardShouldPersistTaps="handled"
                        refreshControl={
                            <RefreshControl refreshing={isLoadingBranches} onRefresh={fetchPublicBranches} tintColor="#8b5cf6" />
                        }
                    >
                        <View style={styles.header}>
                            <TouchableOpacity
                                style={{ position: 'absolute', right: 0, top: 0 }}
                                onPress={fetchPublicBranches}
                            >
                                <Ionicons name="refresh" size={24} color="#8b5cf6" />
                            </TouchableOpacity>
                            <View style={styles.headerIconContainer}>
                                <Ionicons name="restaurant" size={40} color="#fff" />
                            </View>
                            <Text style={styles.headerTitle}>Review IQ</Text>
                            <Text style={styles.headerSubtitle}>Which restaurant would you like to rate?</Text>
                        </View>

                        <View style={styles.searchBarContainer}>
                            <Ionicons name="search" size={20} color="#6b7280" />
                            <TextInput
                                style={styles.searchBar}
                                placeholder="Search restaurants..."
                                placeholderTextColor="#6b7280"
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                returnKeyType="search"
                                onSubmitEditing={handleManualSearch}
                            />
                            {searchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchQuery('')} style={{ marginRight: 10 }}>
                                    <Ionicons name="close-circle" size={20} color="#6b7280" />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.searchActionButton} onPress={handleManualSearch}>
                                <Text style={styles.searchActionText}>Search</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.branchListContainer}>
                            {isLoadingBranches ? (
                                <ActivityIndicator color="#8b5cf6" size="large" style={{ marginTop: 40 }} />
                            ) : fetchError ? (
                                <View style={styles.errorContainer}>
                                    <Text style={styles.loadingText}>{fetchError}</Text>
                                    <TouchableOpacity style={styles.retryBtn} onPress={fetchPublicBranches}>
                                        <Text style={styles.retryText}>Retry</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : filteredBranches.length > 0 ? (
                                filteredBranches.map((b: any) => (
                                    <TouchableOpacity
                                        key={b.id}
                                        style={styles.branchItem}
                                        onPress={() => handleSelectBranch(b)}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.branchName}>{b.name}</Text>
                                            <Text style={styles.branchLocation}>{b.location}</Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color="#8b5cf6" />
                                    </TouchableOpacity>
                                ))
                            ) : (
                                <Text style={styles.loadingText}>No restaurants found.</Text>
                            )}
                        </View>
                    </ScrollView>
                ) : showQR ? (
                    <View style={styles.scrollContainer}>
                        <View style={styles.header}>
                            <View style={styles.headerIconContainer}>
                                <Ionicons name="qr-code" size={40} color="#fff" />
                            </View>
                            <Text style={styles.headerTitle}>{restaurantName}</Text>
                            <Text style={styles.headerSubtitle}>Scan this code or proceed to review!</Text>
                        </View>

                        <View style={styles.qrCard}>
                            <Image
                                source={{ uri: `http://10.130.121.44:19002/qr/preview/${branchId}?name=${encodeURIComponent(restaurantName)}` }}
                                style={styles.qrImage}
                            />
                            <TouchableOpacity
                                style={[styles.startButton, { marginTop: 30 }]}
                                onPress={() => setShowQR(false)}
                            >
                                <Text style={styles.startButtonText}>Proceed to Review</Text>
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : !isStarted ? (
                    <View style={styles.scrollContainer}>
                        <View style={styles.header}>
                            <View style={styles.headerIconContainer}>
                                <Ionicons name="star" size={40} color="#fff" />
                            </View>
                            <Text style={styles.headerTitle}>Review IQ</Text>
                            <Text style={styles.headerSubtitle}>{restaurantName !== 'Restaurant' ? `Reviewing: ${restaurantName}` : 'Welcome! Please enter your details to begin.'}</Text>
                        </View>

                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionTitle}>
                                <Ionicons name="person-outline" size={22} color="#8b5cf6" /> Full Name
                            </Text>
                            <TextInput
                                style={[styles.textInput, { minHeight: 50, marginTop: 10 }]}
                                placeholder="Enter your name..."
                                placeholderTextColor="#6b7280"
                                value={authorName}
                                onChangeText={setAuthorName}
                            />

                            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>
                                <Ionicons name="call-outline" size={22} color="#8b5cf6" /> Phone Number
                            </Text>
                            <TextInput
                                style={[styles.textInput, { minHeight: 50, marginTop: 10 }]}
                                placeholder="Enter your phone number..."
                                placeholderTextColor="#6b7280"
                                value={phoneNumber}
                                onChangeText={setPhoneNumber}
                                keyboardType="phone-pad"
                            />
                        </View>

                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                                if (!authorName.trim() || !phoneNumber.trim()) {
                                    Alert.alert('Required Fields', 'Please enter both your name and phone number to continue.');
                                    return;
                                }
                                setIsStarted(true);
                            }}
                            style={{ marginTop: 20 }}
                        >
                            <LinearGradient
                                colors={['#8b5cf6', '#6366f1']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.submitBtnGradient}
                            >
                                <Text style={styles.submitBtnText}>Start Review</Text>
                                <Ionicons name="arrow-forward" size={20} color="#fff" />
                            </LinearGradient>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">

                        <View style={styles.header}>
                            <View style={styles.headerIconContainer}>
                                <Ionicons name="star" size={40} color="#fff" />
                            </View>
                            <Text style={styles.headerTitle}>Review IQ</Text>
                            <Text style={styles.headerSubtitle}>{restaurantName !== 'Restaurant' ? `Reviewing: ${restaurantName}` : 'We strive for perfection. Let us know how we did today.'}</Text>
                        </View>

                        {/* 10 Rating Criteria */}
                        {criteriaList.map((item, index) => (
                            <AnimatedCard
                                key={item.id}
                                item={item}
                                index={index}
                                ratings={ratings}
                                handleRate={handleRate}
                            />
                        ))}

                        {/* Staff Tagging */}
                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionTitle}>
                                <Ionicons name="person-circle-outline" size={22} color="#8b5cf6" /> Tag Your Server
                            </Text>
                            <Text style={styles.cardDesc}>Who took care of you today?</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
                                {staffList.map((staff) => (
                                    <TouchableOpacity
                                        key={staff}
                                        style={[styles.chip, staffTag === staff && styles.chipActive]}
                                        onPress={() => setStaffTag(staff)}
                                        activeOpacity={0.6}
                                    >
                                        <Text style={[styles.chipText, staffTag === staff && styles.chipTextActive]}>
                                            {staffTag === staff && <Ionicons name="checkmark" size={14} color="#fff" />} {staff}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>

                        {/* Author Name removed - asked initially */}

                        {/* Additional Comments */}
                        <View style={styles.sectionCard}>
                            <Text style={styles.sectionTitle}>
                                <Ionicons name="chatbox-ellipses-outline" size={22} color="#8b5cf6" /> Additional Thoughts
                            </Text>
                            <Text style={styles.cardDesc}>Any specific feedback, compliments, or suggestions?</Text>
                            <TextInput
                                style={styles.textInput}
                                multiline
                                numberOfLines={4}
                                placeholder="Tell us what you loved or what we can improve..."
                                placeholderTextColor="#6b7280"
                                value={comments}
                                onChangeText={setComments}
                                textAlignVertical="top"
                            />
                        </View>

                        {/* Submit Button */}
                        <TouchableOpacity activeOpacity={0.8} onPress={handleSubmit} disabled={isSubmitting}>
                            <LinearGradient
                                colors={isSubmitting ? ['#4b5563', '#374151'] : ['#8b5cf6', '#6366f1']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.submitBtnGradient}
                            >
                                <Text style={styles.submitBtnText}>
                                    {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
                                </Text>
                                {!isSubmitting && <Ionicons name="paper-plane" size={20} color="#fff" />}
                            </LinearGradient>
                        </TouchableOpacity>

                        <View style={{ height: 60 }} />
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#09090b',
    },
    bgOrb: {
        position: 'absolute',
        borderRadius: 9999,
        opacity: 0.15,
        filter: 'blur(40px)', // Only works on web, using opacity/colors for mobile
    },
    orb1: {
        width: 300,
        height: 300,
        backgroundColor: '#8b5cf6',
        top: -50,
        left: -100,
    },
    orb2: {
        width: 250,
        height: 250,
        backgroundColor: '#6366f1',
        bottom: -50,
        right: -50,
    },
    scrollContainer: {
        padding: 20,
        paddingTop: 50,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    headerIconContainer: {
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        padding: 16,
        borderRadius: 24,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(139, 92, 246, 0.3)',
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: '800',
        color: '#fafafa',
        marginBottom: 8,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    headerSubtitle: {
        fontSize: 15,
        color: '#a1a1aa',
        textAlign: 'center',
        maxWidth: '80%',
        lineHeight: 22,
    },
    ratingCard: {
        backgroundColor: 'rgba(24, 24, 27, 0.8)',
        borderRadius: 20,
        padding: 22,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15,
        elevation: 8,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    iconCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    cardTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#fafafa',
    },
    cardDesc: {
        fontSize: 14,
        color: '#a1a1aa',
        marginBottom: 20,
        lineHeight: 20,
    },
    starsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
    },
    starIcon: {
        textShadowColor: 'rgba(251, 191, 36, 0.3)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 8,
    },
    sectionCard: {
        backgroundColor: 'rgba(24, 24, 27, 0.8)',
        borderRadius: 20,
        padding: 22,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fafafa',
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
    },
    horizontalScroll: {
        marginTop: 15,
    },
    chip: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        paddingVertical: 12,
        paddingHorizontal: 22,
        borderRadius: 24,
        marginRight: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipActive: {
        backgroundColor: '#8b5cf6',
        borderColor: '#a78bfa',
        shadowColor: '#8b5cf6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 5,
    },
    chipText: {
        color: '#a1a1aa',
        fontSize: 15,
        fontWeight: '600',
    },
    chipTextActive: {
        color: '#ffffff',
    },
    textInput: {
        backgroundColor: 'rgba(0,0,0,0.4)',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        color: '#fafafa',
        padding: 18,
        fontSize: 16,
        minHeight: 120,
        marginTop: 15,
    },
    submitBtnGradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        padding: 20,
        marginTop: 15,
        shadowColor: '#6366f1',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 8,
    },
    submitBtnText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        marginRight: 10,
        letterSpacing: 0.5,
    },
    successContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
        backgroundColor: '#09090b',
    },
    successIcon: {
        marginBottom: 20,
    },
    successTitle: {
        fontSize: 36,
        fontWeight: '800',
        color: '#fafafa',
        marginBottom: 15,
    },
    successDesc: {
        fontSize: 16,
        color: '#a1a1aa',
        textAlign: 'center',
        marginBottom: 40,
        lineHeight: 24,
    },
    submitBtn: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingVertical: 16,
        paddingHorizontal: 28,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    branchListContainer: {
        marginTop: 20,
    },
    branchItem: {
        backgroundColor: 'rgba(24, 24, 27, 0.8)',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    branchName: {
        fontSize: 18,
        fontWeight: '700',
        color: '#fafafa',
    },
    branchLocation: {
        fontSize: 14,
        color: '#a1a1aa',
        marginTop: 4,
    },
    loadingText: {
        color: '#a1a1aa',
        textAlign: 'center',
        marginTop: 40,
        fontSize: 16,
    },
    qrCard: {
        backgroundColor: 'rgba(24, 24, 27, 0.8)',
        borderRadius: 24,
        padding: 30,
        alignItems: 'center',
        marginTop: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    qrImage: {
        width: 280,
        height: 280,
        borderRadius: 16,
        backgroundColor: '#fff',
    },
    startButton: {
        backgroundColor: '#8b5cf6',
        borderRadius: 16,
        padding: 18,
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
    },
    startButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(24, 24, 27, 0.8)',
        borderRadius: 16,
        paddingHorizontal: 16,
        height: 56,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        marginBottom: 20,
    },
    searchBar: {
        flex: 1,
        color: '#fff',
        fontSize: 16,
        marginLeft: 12,
        height: '100%',
    },
    searchActionButton: {
        backgroundColor: '#8b5cf6',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
    },
    searchActionText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    errorContainer: {
        alignItems: 'center',
        marginTop: 40,
    },
    retryBtn: {
        marginTop: 15,
        paddingVertical: 10,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#8b5cf6',
    },
    retryText: {
        color: '#8b5cf6',
        fontWeight: '600',
    }
});
