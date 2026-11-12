#import <Foundation/Foundation.h>
#import "Store.h"

@protocol Saver <NSObject>
- (BOOL)save:(NSString *)sku;
@end

@interface Cart : NSObject <Saver>
@property (nonatomic, strong) Store *store;
- (instancetype)initWithStore:(Store *)store;
- (NSInteger)add:(NSString *)sku qty:(NSInteger)qty;
+ (Cart *)empty;
@end

@implementation Cart
- (instancetype)initWithStore:(Store *)store {
    self = [super init];
    _store = store;
    return self;
}

- (NSInteger)add:(NSString *)sku qty:(NSInteger)qty {
    [self check:sku];
    [self.store save:sku];
    NSInteger total = helper(qty);
    return total;
}

+ (Cart *)empty {
    return [[Cart alloc] initWithStore:nil];
}
@end

static NSInteger helper(NSInteger n) {
    return n * 2;
}
